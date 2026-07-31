/**
 * job_fetcher.ts
 * Unified Job Fetcher Architecture.
 *
 * Fetches jobs from LinkedIn and Naukri in parallel via self-hosted Lambda microservices.
 */

import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import type { Job } from './types';
import { setTimeout as sleep } from 'timers/promises';
// import { getValidApifyToken, updateApifyTokenUsage, markApifyTokenExpired } from './db_helper';

const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION || 'ap-south-1' });

const LINKEDIN_SCRAPER_NAME = process.env.LINKEDIN_SCRAPER_FUNCTION_NAME || 'linkedin-jobs-scraper';
const NAUKRI_SCRAPER_NAME = process.env.NAUKRI_SCRAPER_FUNCTION_NAME || 'naukri-jobs-scraper';
const SIMPLYHIRED_SCRAPER_NAME = process.env.SIMPLYHIRED_SCRAPER_FUNCTION_NAME || 'simplyhired-jobs-scraper';
const INDEED_SCRAPER_NAME = process.env.INDEED_SCRAPER_FUNCTION_NAME || 'indeed-jobs-scraper';
// const APIFY_ACTOR_ID = 'hKByXkMQaC5Qt9UMN';
const NO_OF_JOBS_TO_FETCH = 50;


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
  'pune': '114806696',
  'chennai': '106888327',
  'india': '102713980',
};

/**
 * Main entry point: Fetch jobs for a candidate user based on candidate profile.
 * Runs LinkedIn and Naukri scrapers in parallel via Lambda.
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
  const queries = buildSearchQueriesFromProfile(user);

  console.log(`[JobFetcher] Processing ${queries.length} queries for user ${user.id || 'unknown'}`);

  if (queries.length === 0) {
    console.warn(`[JobFetcher] No search queries could be generated for user ${user.id}`);
    return [];
  }

  let jobs: Job[] = [];

  // Fetch from all four Lambdas in parallel
  const [linkedinJobs, naukriJobs, simplyhiredJobs, indeedJobs] = await Promise.allSettled([
    fetchViaLambdaScraper(queries, user, lookbackHours),
    fetchViaNaukriLambda(queries, user, lookbackHours),
    fetchViaSimplyHiredLambda(queries, user, lookbackHours),
    fetchViaIndeedLambda(queries, user, lookbackHours),
  ]);

  if (linkedinJobs.status === 'fulfilled') {
    jobs.push(...linkedinJobs.value);
  } else {
    console.warn(`[JobFetcher] LinkedIn scraper failed: ${linkedinJobs.reason?.message}`);
  }

  if (naukriJobs.status === 'fulfilled') {
    jobs.push(...naukriJobs.value);
  } else {
    console.warn(`[JobFetcher] Naukri scraper failed: ${naukriJobs.reason?.message}`);
  }

  if (simplyhiredJobs.status === 'fulfilled') {
    jobs.push(...simplyhiredJobs.value);
  } else {
    console.warn(`[JobFetcher] SimplyHired scraper failed: ${simplyhiredJobs.reason?.message}`);
  }

  if (indeedJobs.status === 'fulfilled') {
    jobs.push(...indeedJobs.value);
  } else {
    console.warn(`[JobFetcher] Indeed scraper failed: ${indeedJobs.reason?.message}`);
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
  const jobType = ['full time'];

  const allJobs: Job[] = [];
  const CONCURRENCY = 5;
  const BATCH_DELAY_MS = 1000; // 1 seconds delay between concurrent batches

  for (let i = 0; i < queries.length; i += CONCURRENCY) {
    const batch = queries.slice(i, i + CONCURRENCY);

    const results = await Promise.allSettled(
      batch.map(q => invokeScraperLambda(LINKEDIN_SCRAPER_NAME, {
        keyword: q.keyword,
        location: q.location,
        geoId: q.geoId,
        dateSincePosted,
        experienceLevel,
        jobType,
        sortBy: 'recent',
        limit: NO_OF_JOBS_TO_FETCH,
      }))
    );

    for (let j = 0; j < results.length; j++) {
      const res = results[j];
      const q = batch[j];
      if (res.status === 'fulfilled') {
        const mapped = res.value.map(item => mapScraperItemToJob(item, 'linkedin'));
        allJobs.push(...mapped);
        console.log(`  ✓ LinkedIn: "${q.keyword}" @ "${q.location}" → ${res.value.length} jobs`);
      } else {
        console.warn(`  ✗ LinkedIn: "${q.keyword}" @ "${q.location}" failed: ${res.reason?.message || 'Error'}`);
      }
    }

    if (i + CONCURRENCY < queries.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  return allJobs;
}

// ─── NAUKRI LAMBDA SCRAPER PROVIDER ─────────────────────────────────────────

async function fetchViaNaukriLambda(
  queries: SearchQuery[],
  user: { experienceYears?: number | null; employmentType?: string | null },
  lookbackHours: number
): Promise<Job[]> {
  const jobAge = lookbackHours <= 24 ? '1' : lookbackHours <= 168 ? '7' : '30';
  const experience = user.experienceYears != null ? String(Math.ceil(user.experienceYears)) : undefined;

  const allJobs: Job[] = [];
  const CONCURRENCY = 5;
  const BATCH_DELAY_MS = 2000;

  for (let i = 0; i < queries.length; i += CONCURRENCY) {
    const batch = queries.slice(i, i + CONCURRENCY);

    const results = await Promise.allSettled(
      batch.map(q => invokeScraperLambda(NAUKRI_SCRAPER_NAME, {
        keyword: q.keyword,
        jobAge,
        location: "India",
        experience,
        limit: NO_OF_JOBS_TO_FETCH,
        sort: 'date',
      }))
    );

    for (let j = 0; j < results.length; j++) {
      const res = results[j];
      const q = batch[j];
      if (res.status === 'fulfilled') {
        const mapped = res.value.map(item => mapScraperItemToJob(item, 'naukri'));
        allJobs.push(...mapped);
        console.log(`  ✓ Naukri: "${q.keyword}" @ "${q.location}" → ${res.value.length} jobs`);
      } else {
        console.warn(`  ✗ Naukri: "${q.keyword}" @ "${q.location}" failed: ${res.reason?.message || 'Error'}`);
      }
    }

    if (i + CONCURRENCY < queries.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  return allJobs;
}

// ─── SIMPLYHIRED LAMBDA SCRAPER PROVIDER ────────────────────────────────────

async function fetchViaSimplyHiredLambda(
  queries: SearchQuery[],
  user: { experienceYears?: number | null; employmentType?: string | null },
  lookbackHours: number
): Promise<Job[]> {
  const datePosted = lookbackHours <= 24 ? '24hr' : lookbackHours <= 72 ? '3days' : lookbackHours <= 168 ? '7days' : '30days';
  
  // Experience for keyword
  let expKeyword = '';
  if (user.experienceYears != null) {
    if (user.experienceYears <= 1) expKeyword = ' fresher';
    else if (user.experienceYears <= 3) expKeyword = ' entry level';
    else if (user.experienceYears <= 8) expKeyword = ' senior';
    else expKeyword = ' lead';
  }

  const allJobs: Job[] = [];
  const CONCURRENCY = 5;
  const BATCH_DELAY_MS = 2000;

  for (let i = 0; i < queries.length; i += CONCURRENCY) {
    const batch = queries.slice(i, i + CONCURRENCY);

    const results = await Promise.allSettled(
      batch.map(q => invokeScraperLambda(SIMPLYHIRED_SCRAPER_NAME, {
        keyword: q.keyword + expKeyword,
        location: q.location,
        datePosted,
        jobType: 'fulltime',
        limit: NO_OF_JOBS_TO_FETCH,
        sort: 'date',
      }))
    );

    for (let j = 0; j < results.length; j++) {
      const res = results[j];
      const q = batch[j];
      if (res.status === 'fulfilled') {
        const mapped = res.value.map(item => mapScraperItemToJob(item, 'simplyhired'));
        allJobs.push(...mapped);
        console.log(`  ✓ SimplyHired: "${q.keyword}" @ "${q.location}" → ${res.value.length} jobs`);
      } else {
        console.warn(`  ✗ SimplyHired: "${q.keyword}" @ "${q.location}" failed: ${res.reason?.message || 'Error'}`);
      }
    }

    if (i + CONCURRENCY < queries.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  return allJobs;
}

// ─── INDEED LAMBDA SCRAPER PROVIDER ─────────────────────────────────────────

async function fetchViaIndeedLambda(
  queries: SearchQuery[],
  user: { experienceYears?: number | null; employmentType?: string | null },
  lookbackHours: number
): Promise<Job[]> {
  const fromage = lookbackHours <= 24 ? 1 : lookbackHours <= 72 ? 3 : lookbackHours <= 168 ? 7 : 30;

  const allJobs: Job[] = [];
  const CONCURRENCY = 5;
  const BATCH_DELAY_MS = 2000;

  for (let i = 0; i < queries.length; i += CONCURRENCY) {
    const batch = queries.slice(i, i + CONCURRENCY);

    const results = await Promise.allSettled(
      batch.map(q => invokeScraperLambda(INDEED_SCRAPER_NAME, {
        keyword: q.keyword,
        location: 'India',
        fromage,
        jobType: 'fulltime',
        limit: NO_OF_JOBS_TO_FETCH,
        sort: 'date',
      }))
    );

    for (let j = 0; j < results.length; j++) {
      const res = results[j];
      const q = batch[j];
      if (res.status === 'fulfilled') {
        const mapped = res.value.map(item => mapScraperItemToJob(item, 'indeed'));
        allJobs.push(...mapped);
        console.log(`  ✓ Indeed: "${q.keyword}" @ "${q.location}" → ${res.value.length} jobs`);
      } else {
        console.warn(`  ✗ Indeed: "${q.keyword}" @ "${q.location}" failed: ${res.reason?.message || 'Error'}`);
      }
    }

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

async function invokeScraperLambda(functionName: string, params: Record<string, unknown>): Promise<ScraperItem[]> {
  const command = new InvokeCommand({
    FunctionName: functionName,
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

function mapScraperItemToJob(item: ScraperItem, source: 'linkedin' | 'naukri' | 'simplyhired' | 'indeed' = 'linkedin'): Job {
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
    _source: source,
  };
}

// ─── APIFY PROVIDER (DEPRECATED) ───────────────────────────────────────────
// No longer in use — both LinkedIn and Naukri scrapers are served via self-hosted Lambdas.
// Keeping this code commented in case Apify is ever needed as a fallback again.
// Re-enable by:
//   - Uncommenting the import: import { getValidApifyToken, updateApifyTokenUsage, markApifyTokenExpired } from './db_helper';
//   - Uncommenting APIFY_ACTOR_ID constant above
//   - Uncommenting the fallback block in fetchJobsForUser below the Naukri result check

// async function fetchViaApify(
//   queries: SearchQuery[],
//   lookbackHours: number
// ): Promise<Job[]> {
//   const urls = queries.map(q => {
//     const kw = encodeURIComponent(q.keyword);
//     const loc = encodeURIComponent(q.location);
//     const geoParam = q.geoId ? `&geoId=${q.geoId}` : '';
//     const lookbackSeconds = Math.floor(lookbackHours * 3600);
//     return `https://www.linkedin.com/jobs/search/?keywords=${kw}&location=${loc}${geoParam}&f_TPR=r${lookbackSeconds}`;
//   });
//
//   const tokenData = await getValidApifyToken();
//   if (!tokenData) throw new Error("No valid Apify token available.");
//
//   const endpoint = `https://api.apify.com/v2/acts/${APIFY_ACTOR_ID}/run-sync-get-dataset-items?token=${tokenData.apiKey}&format=json&clean=true&memory=1024`;
//   const body = JSON.stringify({
//     urls,
//     scrapeCompany: false,
//     count: 25,
//     useIncognitoMode: false
//   });
//
//   const controller = new AbortController();
//   const timer = setTimeout(() => controller.abort(), 180000);
//
//   try {
//     const res = await fetch(endpoint, {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body,
//       signal: controller.signal,
//     });
//
//     clearTimeout(timer);
//
//     if (!res.ok) {
//       const text = await res.text();
//       if (res.status === 401 || res.status === 403) {
//         await markApifyTokenExpired(tokenData.id);
//       }
//       throw new Error(`Apify HTTP ${res.status}: ${text}`);
//     }
//
//     const items = await res.json();
//     if (!Array.isArray(items)) throw new Error('Apify returned non-array response');
//
//     await updateApifyTokenUsage(tokenData.id, items.length);
//     const jobs = items as Job[];
//     jobs.forEach(j => { j._source = 'apify'; });
//     return jobs;
//   } catch (err) {
//     clearTimeout(timer);
//     throw err;
//   }
// }

// ─── UTILITIES ─────────────────────────────────────────────────────────────

function mapExperienceYears(years: number): string[] {
  if (years <= 1) return ['internship', 'entry level'];
  if (years <= 3) return ['entry level', 'associate'];
  if (years <= 5) return ['associate'];
  if (years <= 8) return ['associate', 'senior'];
  if (years <= 12) return ['senior'];
  return ['senior', 'director'];
}
