/**
 * job_fetcher.ts
 * Unified Job Fetcher Architecture.
 *
 * Switch scraper providers seamlessly via environment variable:
 *   SCRAPER_PROVIDER="lambda"  (default: self-hosted Lambda microservice, $0 cost)
 *   SCRAPER_PROVIDER="apify"   (fallback/secondary: Apify actor scraping)
 *
 * Clean separation of concern:
 * 1. Query Builder: Auto-constructs (Keyword × Location) search queries from candidate profile.
 * 2. Provider Invoker: Executes parallel search queries against selected scraping engine.
 * 3. Output Standardization: Returns unified Job[] with full descriptionText and metadata.
 */

import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import type { Job } from './types';
import { setTimeout as sleep } from 'timers/promises';
import { getValidApifyToken, updateApifyTokenUsage, markApifyTokenExpired } from './db_helper';

const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION || 'ap-south-1' });

const LAMBDA_SCRAPER_NAME = process.env.LINKEDIN_SCRAPER_FUNCTION_NAME || 'linkedin-jobs-scraper-prod';
const APIFY_ACTOR_ID = 'hKByXkMQaC5Qt9UMN';

/** Single search query sent to the scraper engine */
export interface SearchQuery {
  keyword: string;
  location: string;
  geoId?: string;
}

// Major Indian tech city geoIds for pinpoint location targeting
const CITY_GEO_IDS: Record<string, string> = {
  'bengaluru': '90009633',
  'bangalore': '90009633',
  'hyderabad': '90009650',
  'mumbai': '90009639',
  'delhi': '106187582',
  'gurugram': '115884833',
  'gurgaon': '115884833',
  'noida': '104869687',
  'pune': '114806696',
  'chennai': '106888327',
  'kolkata': '111795395',
  'india': '102713980',
};

/**
 * Main entry point: Fetch jobs for a candidate user based on candidate profile.
 * Controlled by SCRAPER_PROVIDER env var ("lambda" | "apify").
 */
export async function fetchJobsForUser(
  user: {
    id?: string;
    suggestedJobTitles?: string[] | null;
    targetLocations?: string | null;
    experienceYears?: number | null;
    employmentType?: string | null;
  },
  lookbackHours: number = 12
): Promise<Job[]> {
  const provider = (process.env.SCRAPER_PROVIDER || 'lambda').toLowerCase();
  const queries = buildSearchQueriesFromProfile(user);

  console.log(`[JobFetcher] Provider: "${provider}". Processing ${queries.length} queries for user ${user.id || 'unknown'}`);

  if (queries.length === 0) {
    console.warn(`[JobFetcher] No search queries could be generated for user ${user.id}`);
    return [];
  }

  let jobs: Job[] = [];

  if (provider === 'apify') {
    try {
      jobs = await fetchViaApify(queries, lookbackHours);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[JobFetcher] Apify provider failed (${errMsg}). Falling back to Lambda...`);
      jobs = await fetchViaLambdaScraper(queries, user, lookbackHours);
    }
  } else {
    // Default provider: "lambda"
    try {
      jobs = await fetchViaLambdaScraper(queries, user, lookbackHours);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[JobFetcher] Lambda provider failed (${errMsg}). Trying Apify fallback...`);
      jobs = await fetchViaApify(queries, lookbackHours);
    }
  }

  // Deduplicate by link across queries
  const seen = new Set<string>();
  const uniqueJobs = jobs.filter(j => {
    if (!j.link || seen.has(j.link)) return false;
    seen.add(j.link);
    return true;
  });

  console.log(`[JobFetcher] Final count: ${jobs.length} raw → ${uniqueJobs.length} unique jobs`);
  return uniqueJobs;
}

// ─── QUERY BUILDER ─────────────────────────────────────────────────────────

function buildSearchQueriesFromProfile(user: {
  suggestedJobTitles?: string[] | null;
  targetLocations?: string | null;
}): SearchQuery[] {
  const keywords = extractKeywords(user);
  const locations = extractLocations(user);

  if (keywords.length === 0 || locations.length === 0) return [];

  const queries: SearchQuery[] = [];
  for (const keyword of keywords) {
    for (const location of locations) {
      queries.push({
        keyword,
        location: location.name,
        geoId: location.geoId,
      });
    }
  }
  return queries;
}

function extractKeywords(user: {
  suggestedJobTitles?: string[] | null;
}): string[] {
  if (user.suggestedJobTitles && user.suggestedJobTitles.length > 0) {
    return user.suggestedJobTitles.slice(0, 5);
  }
  return [];
}

function extractLocations(user: {
  targetLocations?: string | null;
}): Array<{ name: string; geoId?: string }> {
  if (user.targetLocations) {
    const locs = user.targetLocations.split(',').map(l => l.trim().toLowerCase()).filter(Boolean);
    if (locs.length > 0) {
      return locs.map(loc => ({
        name: loc,
        geoId: CITY_GEO_IDS[loc],
      }));
    }
  }

  // Default: Search across all major Indian tech cities + nationwide for maximum precision
  return [
    { name: 'Bengaluru', geoId: '90009633' },
    { name: 'Hyderabad', geoId: '90009650' },
    { name: 'Mumbai', geoId: '90009639' },
    { name: 'Delhi', geoId: '106187582' },
    { name: 'Gurugram', geoId: '115884833' },
    { name: 'Noida', geoId: '104869687' },
    { name: 'Pune', geoId: '114806696' },
    { name: 'Chennai', geoId: '106888327' },
    { name: 'Kolkata', geoId: '111795395' },
    { name: 'India', geoId: '102713980' },
  ];
}

// ─── LAMBDA SCRAPER PROVIDER ────────────────────────────────────────────────

async function fetchViaLambdaScraper(
  queries: SearchQuery[],
  user: { experienceYears?: number | null; employmentType?: string | null },
  lookbackHours: number
): Promise<Job[]> {
  const dateSincePosted = lookbackHours <= 24 ? '24hr' : lookbackHours <= 168 ? 'past week' : 'past month';
  const experienceLevel = mapExperienceYears(user.experienceYears ?? 0);
  const jobType = mapEmploymentType(user.employmentType);

  const allJobs: Job[] = [];
  const CONCURRENCY = 4;
  const BATCH_DELAY_MS = 2000; // 2 seconds delay between concurrent batches

  for (let i = 0; i < queries.length; i += CONCURRENCY) {
    const batch = queries.slice(i, i + CONCURRENCY);

    const results = await Promise.allSettled(
      batch.map(q => invokeScraperLambda({
        keyword: q.keyword,
        location: q.location,
        geoId: q.geoId,
        dateSincePosted,
        experienceLevel,
        jobType,
        sortBy: 'recent',
        limit: 25,
      }))
    );

    for (let j = 0; j < results.length; j++) {
      const res = results[j];
      const q = batch[j];
      if (res.status === 'fulfilled') {
        const mapped = res.value.map(item => mapScraperItemToJob(item));
        allJobs.push(...mapped);
        console.log(`  ✓ Lambda Scraper: "${q.keyword}" @ "${q.location}" → ${res.value.length} jobs`);
      } else {
        console.warn(`  ✗ Lambda Scraper: "${q.keyword}" @ "${q.location}" failed: ${res.reason?.message || 'Error'}`);
      }
    }

    // Polite sleep delay between concurrent batches to prevent LinkedIn throttling
    if (i + CONCURRENCY < queries.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  return allJobs;
}

interface ScraperItem {
  id?: string;
  jobUrl?: string;
  position?: string;
  company?: string;
  location?: string;
  agoTime?: string;
  date?: string;
  salary?: string;
  details?: {
    descriptionText?: string;
    seniorityLevel?: string;
    employmentType?: string;
    jobFunction?: string;
    industries?: string;
    numApplicants?: string;
  };
}

async function invokeScraperLambda(params: Record<string, unknown>): Promise<ScraperItem[]> {
  const command = new InvokeCommand({
    FunctionName: LAMBDA_SCRAPER_NAME,
    Payload: Buffer.from(JSON.stringify({ queryStringParameters: params })),
  });

  const response = await lambdaClient.send(command);
  if (!response.Payload) throw new Error('Empty payload from scraper Lambda');

  const raw = JSON.parse(Buffer.from(response.Payload).toString());
  if (raw.errorMessage) throw new Error(`Lambda runtime error: ${raw.errorMessage}`);

  const body = JSON.parse(raw.body || '{}');
  if (!body.success) throw new Error(body.error || 'Scraper failed');

  return body.data || [];
}

function mapScraperItemToJob(item: ScraperItem): Job {
  const details = item.details;
  return {
    id: item.id,
    link: item.jobUrl,
    title: item.position,
    companyName: item.company,
    location: item.location,
    postedAt: item.agoTime || item.date,
    salary: item.salary !== 'Not specified' ? item.salary : undefined,
    descriptionText: details?.descriptionText || undefined,
    seniorityLevel: details?.seniorityLevel || undefined,
    employmentType: details?.employmentType || undefined,
    jobFunction: details?.jobFunction || undefined,
    industries: details?.industries || undefined,
    applicantsCount: details?.numApplicants || undefined,
  };
}

// ─── APIFY PROVIDER (SECONDARY / FALLBACK) ──────────────────────────────────

async function fetchViaApify(
  queries: SearchQuery[],
  lookbackHours: number
): Promise<Job[]> {
  const urls = queries.map(q => {
    const kw = encodeURIComponent(q.keyword);
    const loc = encodeURIComponent(q.location);
    const geoParam = q.geoId ? `&geoId=${q.geoId}` : '';
    const lookbackSeconds = Math.floor(lookbackHours * 3600);
    return `https://www.linkedin.com/jobs/search/?keywords=${kw}&location=${loc}${geoParam}&f_TPR=r${lookbackSeconds}`;
  });

  const tokenData = await getValidApifyToken();
  if (!tokenData) throw new Error("No valid Apify token available.");

  const endpoint = `https://api.apify.com/v2/acts/${APIFY_ACTOR_ID}/run-sync-get-dataset-items?token=${tokenData.apiKey}&format=json&clean=true&memory=1024`;
  const body = JSON.stringify({
    urls,
    scrapeCompany: false,
    count: 25,
    useIncognitoMode: false
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180000);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      const text = await res.text();
      if (res.status === 401 || res.status === 403) {
        await markApifyTokenExpired(tokenData.id);
      }
      throw new Error(`Apify HTTP ${res.status}: ${text}`);
    }

    const items = await res.json();
    if (!Array.isArray(items)) throw new Error('Apify returned non-array response');

    await updateApifyTokenUsage(tokenData.id, items.length);
    return items as Job[];
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// ─── UTILITIES ─────────────────────────────────────────────────────────────

function mapExperienceYears(years: number): string[] {
  if (years <= 1) return ['internship', 'entry level'];
  if (years <= 3) return ['entry level', 'associate'];
  if (years <= 7) return ['associate', 'senior'];
  if (years <= 12) return ['senior', 'director'];
  return ['director', 'executive'];
}

function mapEmploymentType(type?: string | null): string[] {
  if (!type) return ['full time'];
  const lower = type.toLowerCase();
  if (lower.includes('contract')) return ['full time', 'contract'];
  if (lower.includes('part')) return ['part time'];
  if (lower.includes('intern')) return ['internship'];
  return ['full time'];
}
