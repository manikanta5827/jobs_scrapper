/**
 * lambda.ts — Main Lambda Handler
 * Triggered by EventBridge daily at 2:00 AM UTC (7:30 AM IST)
 * Flow: Apify scrape → Deduplicate → Keyword filter → OpenAI relevance → Neon DB
 */

import type { ScheduledEvent, Context, APIGatewayProxyResult } from 'aws-lambda';
import { scrapeJobs } from './helper/apify';
import { checkRelevanceBatch } from './helper/openai';
import { getExistingJobLinks, trackJobLinks, insertMatchedJobs, cleanupOldSeenJobs } from './helper/db_helper';
import { sendEmail } from './helper/ses_helper';
import { loadSecrets } from './helper/secret_helper';
import type { Job } from './helper/types';

// ─── Config ──────────────────────────────────────────────────────────────────
const SEARCH_URLS: string[] = [
  'https://www.linkedin.com/jobs/search?keywords=Software%20Developer%20OR%20Software%20Engineer%20OR%20Backend%20Developer&location=Bengaluru&geoId=105214831&distance=25&f_TPR=r86400&f_E=2&position=1&pageNum=0',
  'https://www.linkedin.com/jobs/search?keywords=Software%20Developer%20OR%20Software%20Engineer%20OR%20Backend%20Developer&location=Hyderabad&geoId=105556991&distance=25&f_TPR=r86400&f_E=2&position=1&pageNum=0',
  'https://www.linkedin.com/jobs/search?keywords=Software%20Developer%20OR%20Software%20Engineer%20OR%20Backend%20Developer&location=Chennai&geoId=106888327&distance=25&f_TPR=r86400&f_E=2&position=1&pageNum=0'
];

// Only skip 5+ YOE. 2-3 years is fine for a junior developer.
const EXCLUDE_KEYWORDS: string[] = [
  '5+ years', '6+ years', '7+ years', '8+ years', '10+ years',
  '5 years', '6 years', '7 years', '8 years', '10 years',
  'senior architect', 'principal engineer', 'vp of engineering',
];

const EXCLUDE_TITLE_KEYWORDS: string[] = [
  '2', '3', 'L3', 'L4', 'Test', 'Quality', 'Support', 'Testing', 'Android', 'Mobile', 'React.js', 'React Js', 'React Native', 'Flutter', 'iOS', 'Unity', 'Game', 'SRE', 'Data Engineer', 'Data Scientist', 'Machine Learning', 'ML Engineer', 'AI Engineer', 'Security', 'Network', 'Hardware', 'Embedded', 'Firmware', 'Front End', 'Frontend', 'UI/UX', 'Designer', 'Product Manager', 'Project Manager'
];

const OPENAI_BATCH_SIZE = 10;
const BATCH_DELAY_MS = 3000;

// ─── Types ───────────────────────────────────────────────────────────────────
interface LambdaResponse {
  total_scraped: number;
  new_jobs: number;
  matched: number;
  rejected: number;
  binned: number;
}

interface FilterResult {
  relevant: Job[];
  binned: Job[];
}

interface CustomEvent {
  lookbackHours?: number;
}

// ─── Handler ─────────────────────────────────────────────────────────────────
export const handler = async (
  event: CustomEvent & ScheduledEvent,
  _context: Context
): Promise<APIGatewayProxyResult> => {
  const lookbackHours = event.lookbackHours || 24;
  const lookbackSeconds = Math.floor(lookbackHours * 3600);
  console.log(`Job scraper started. Lookback: ${lookbackHours} hours (${lookbackSeconds}s)`, new Date().toISOString());

  try {
    // IMPORTANT: Load secrets from SSM first
    await loadSecrets();

    const MASTER_EMAIL = process.env.MASTER_EMAIL!;
    const RECEIVER_EMAIL = process.env.RECEIVER_EMAIL!;

    // Optional: Cleanup old jobs once a day or on every run
    await cleanupOldSeenJobs();

    // Step 1: Scrape all cities with dynamic lookback
    const dynamicUrls = SEARCH_URLS.map(url => 
      url.replace(/f_TPR=r\d+/, `f_TPR=r${lookbackSeconds}`)
    );
    
    const rawJobs = await scrapeJobs(dynamicUrls);
    console.log(`Scraped ${rawJobs.length} total jobs across all cities`);

    if (rawJobs.length === 0) {
      return response(200, 'No jobs scraped. Apify may have returned empty.');
    }

    // Step 2: Deduplicate within rawJobs and against existing DB records
    const existingLinks = await getExistingJobLinks();

    // 1. Deduplicate the current batch of scraped jobs by link
    const uniqueRawJobs = Array.from(
      new Map(
        rawJobs
          .filter((job: Job) => !!job.link)
          .map((job: Job) => [job.link!, job])
      ).values()
    );

    // 2. Filter out jobs already present in the database
    const newJobs = uniqueRawJobs.filter((job: Job) => !existingLinks.has(job.link!));

    console.log(`${newJobs.length} new jobs after batch dedup and DB check (${rawJobs.length - newJobs.length} skipped)`);

    if (newJobs.length === 0) {
      return response(200, 'All jobs already processed. Nothing new today.');
    }

    // Step 3: Keyword pre-filter (free, no API call)
    const { relevant: toCheck, binned: keywordBinned } = keywordFilter(newJobs);
    console.log(`Keyword filter: ${toCheck.length} to check, ${keywordBinned.length} auto-binned`);

    // Step 4: OpenAI relevance check in batches
    const { matched, rejected } = await checkRelevanceBatch(toCheck, OPENAI_BATCH_SIZE, BATCH_DELAY_MS);
    console.log(`OpenAI: ${matched.length} matched, ${rejected.length} rejected`);

    // Step 5: Write to DB
    // 1. Track all new links so we don't process them again
    const allNewLinks = newJobs.map((j: Job) => j.link).filter((l: string | undefined): l is string => !!l);
    await trackJobLinks(allNewLinks);

    // 2. Insert only matched jobs for the dashboard
    if (matched.length > 0) {
      await insertMatchedJobs(matched);
      console.log(`Inserted ${matched.length} matched jobs into matched_jobs table`);

      // 3. Send email notification
      const dateStr = new Date().toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });

      // Sort matched jobs by AI score descending (highest score first)
      const sortedMatched = [...matched].sort((a, b) => (b.ai_score ?? 0) - (a.ai_score ?? 0));

      const subject = `Job Match Summary - ${dateStr} (${sortedMatched.length} New Jobs)`;

      const htmlBody = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: auto; color: #333; line-height: 1.6;">
          <h2 style="color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px; margin-bottom: 20px;">
            Daily Job Match Summary
          </h2>
          <p style="font-size: 1.1em;">
            We found <strong>${sortedMatched.length}</strong> new job opportunities matching your profile for today, <strong>${dateStr}</strong>.
          </p>

          ${sortedMatched.map(j => `
            <div style="margin-bottom: 25px; padding: 20px; border: 1px solid #e1e4e8; border-radius: 10px; background-color: #ffffff; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
              <h3 style="margin-top: 0; margin-bottom: 12px;">
                <a href="${j.link}" style="color: #007bff; text-decoration: none; font-size: 1.2em;">${j.title}</a>
              </h3>
              <div style="margin-bottom: 8px; color: #555;">
                <span style="font-weight: 600;">Company:</span> ${j.companyName}
              </div>
              <div style="margin-bottom: 8px; color: #555;">
                <span style="font-weight: 600;">Match Score:</span>
                <span style="padding: 2px 10px; background: ${ (j.ai_score ?? 0) > 80 ? '#d4edda' : '#fff3cd'}; color: ${ (j.ai_score ?? 0) > 80 ? '#155724' : '#856404'}; border-radius: 12px; font-size: 0.9em; font-weight: 600;">
                  ${j.ai_score}/100
                </span>
              </div>
              <div style="margin-bottom: 12px; color: #555;">
                <span style="font-weight: 600;">Match Reason:</span> ${j.ai_reason}
              </div>
              ${j.ai_matched_skills && j.ai_matched_skills.length > 0 ? `
                <div style="font-size: 0.95em; color: #666; background: #f8f9fa; padding: 10px; border-radius: 6px;">
                  <span style="font-weight: 600;">Matched Skills:</span> ${j.ai_matched_skills.join(', ')}
                </div>
              ` : ''}
            </div>
          `).join('')}

          <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #888; font-size: 0.85em;">
            <p>This is an automated report from your Job Scraper Service.</p>
            <p>&copy; ${new Date().getFullYear()} Job Scraper Inc.</p>
          </div>
        </div>
      `;

      await sendEmail(MASTER_EMAIL, RECEIVER_EMAIL, subject, htmlBody);
    }

    const result: LambdaResponse = {
      total_scraped: rawJobs.length,
      new_jobs: newJobs.length,
      matched: matched.length,
      rejected: rejected.length,
      binned: keywordBinned.length,
    };

    return response(200, result);

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Lambda failed:', message);
    return response(500, { error: message });
  }
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function keywordFilter(jobs: Job[]): FilterResult {
  const relevant: Job[] = [];
  const binned: Job[] = [];

  for (const job of jobs) {
    const title = (job.title ?? '').toLowerCase();
    const text = `${title} ${job.descriptionText ?? ''}`.toLowerCase();

    // Check general exclude keywords in full text
    const matchedGeneral = EXCLUDE_KEYWORDS.filter(kw => text.includes(kw.toLowerCase()));

    // Check specific title keywords in title only
    const matchedTitle = EXCLUDE_TITLE_KEYWORDS.filter(kw => title.includes(kw.toLowerCase()));

    const allMatched = [...new Set([...matchedGeneral, ...matchedTitle])];

    if (allMatched.length > 0) {
      binned.push({ ...job, keyword_bin_reason: allMatched.join(', ') });
    } else {
      relevant.push(job);
    }
  }

  return { relevant, binned };
}

function response(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    body: JSON.stringify(body),
  };
}
