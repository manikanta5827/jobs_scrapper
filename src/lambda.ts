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
  'https://www.linkedin.com/jobs/search?keywords=Software%20Developer%20OR%20Software%20Engineer%20OR%20Backend%20Developer&location=Hyderabad&geoId=105556991&distance=25&f_TPR=r86400&f_E=2&position=1&pageNum=0'
];

// Only skip 5+ YOE. 2-3 years is fine for a junior developer.
const EXCLUDE_KEYWORDS: string[] = [
  '5+ years', '6+ years', '7+ years', '8+ years', '10+ years',
  '5 years', '6 years', '7 years', '8 years', '10 years',
  'senior architect', 'principal engineer', 'vp of engineering',
];

const EXCLUDE_TITLE_KEYWORDS: string[] = [
  '2', '3', 'L3', 'L4', 'Test', 'Quality', 'Support', 'Testing', 'Android', 'Mobile'
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

// ─── Handler ─────────────────────────────────────────────────────────────────
export const handler = async (
  _event: ScheduledEvent,
  _context: Context
): Promise<APIGatewayProxyResult> => {
  console.log('Job scraper started', new Date().toISOString());

  try {
    // IMPORTANT: Load secrets from SSM first
    await loadSecrets();

    const MASTER_EMAIL = process.env.MASTER_EMAIL!;
    const RECEIVER_EMAIL = process.env.RECEIVER_EMAIL!;

    // Optional: Cleanup old jobs once a day or on every run
    await cleanupOldSeenJobs();

    // Step 1: Scrape all cities
    const rawJobs = await scrapeJobs(SEARCH_URLS);
    console.log(`Scraped ${rawJobs.length} total jobs across all cities`);

    if (rawJobs.length === 0) {
      return response(200, 'No jobs scraped. Apify may have returned empty.');
    }

    // Step 2: Deduplicate against existing DB records
    const existingLinks = await getExistingJobLinks();
    const newJobs = rawJobs.filter((job: Job) => job.link && !existingLinks.has(job.link));
    console.log(`${newJobs.length} new jobs after dedup (${rawJobs.length - newJobs.length} already seen)`);

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
      const subject = `🚀 ${matched.length} New Relevant Jobs Found!`;
      const htmlBody = `
        <h2>Daily Job Match Summary</h2>
        <p>Found <b>${matched.length}</b> new jobs matching your profile today.</p>
        <hr/>
        ${matched.map(j => `
          <div style="margin-bottom: 20px; border-bottom: 1px solid #eee; padding-bottom: 10px;">
            <h3 style="margin-bottom: 5px;"><a href="${j.link}">${j.title}</a></h3>
            <p style="margin: 0; color: #555;"><b>Company:</b> ${j.companyName}</p>
            <p style="margin: 0; color: #555;"><b>Score:</b> ${j.ai_score}/100</p>
            <p style="margin: 5px 0;"><b>Reason:</b> ${j.ai_reason}</p>
            <p style="margin: 0; font-size: 0.9em; color: #666;"><b>Matched:</b> ${j.ai_matched_skills?.join(', ')}</p>
          </div>
        `).join('')}
        <p>Good Luck!</p>
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
