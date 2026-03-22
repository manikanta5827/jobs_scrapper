/**
 * lambda.ts — Main Lambda Handler
 * Triggered by EventBridge daily at 2:00 AM UTC (7:30 AM IST)
 * Flow: Scrape → Clean/Dedup → DB Check → Keyword Filter → OpenAI AI Match → Notify
 */

import type { ScheduledEvent, Context, APIGatewayProxyResult } from 'aws-lambda';
import { scrapeJobs } from './helper/apify';
import { checkRelevanceBatch } from './helper/openai';
import { getExistingJobsData, trackJobs, resetHighUsageTokens } from './helper/db_helper';
import { getUniqueJobsFromBatch } from './helper/job_utils';
import { keywordFilter, prepareSearchUrls } from './helper/filter';
import { sendTelegramMessage } from './helper/telegram_helper';
import { 
  getSuccessHeader, 
  getDroppedHeader,
  getMatchedJobMessage, 
  getDroppedJobMessage, 
  getFailureTelegramMessage,
  getZeroMatchesMessage
} from './helper/telegram_templates';
import type { Job, JobStats } from './helper/types';

// ─── Config ──────────────────────────────────────────────────────────────────
const OPENAI_BATCH_SIZE = 10;
const BATCH_DELAY_MS = 3000;

const TELEGRAM_MATCHED_JOBS_BOT_TOKEN = process.env.TELEGRAM_MATCHED_JOBS_BOT_TOKEN!;
const TELEGRAM_MATCHED_JOBS_CHAT_ID = process.env.TELEGRAM_MATCHED_JOBS_CHAT_ID!;

const TELEGRAM_DROPPED_JOBS_BOT_TOKEN = process.env.TELEGRAM_DROPPED_JOBS_BOT_TOKEN!;
const TELEGRAM_DROPPED_JOBS_CHAT_ID = process.env.TELEGRAM_DROPPED_JOBS_CHAT_ID!;


// ─── Handler ─────────────────────────────────────────────────────────────────
export const handler = async (
  event: { lookbackHours?: number; adminApiKey?: string } & ScheduledEvent,
  _context: Context
): Promise<APIGatewayProxyResult> => {
  // 🛡️ Security Check
  // The key must match the secret value
  const isAuthorized = 
    event.adminApiKey === process.env.ADMIN_API_KEY;

  if (!isAuthorized) {
    console.warn('Unauthorized attempt to trigger MainLambda');
    return response(401, { error: 'Unauthorized: Missing or invalid adminApiKey' });
  }

  const lookbackHours = event.lookbackHours || 24;
  const lookbackSeconds = Math.floor(lookbackHours * 3600);
  const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const allDropped: { job: any, reason: string }[] = [];

  console.log(`Job scraper started. Lookback: ${lookbackHours}h`, new Date().toISOString());

  // Reset high usage tokens that have expired subscriptions
  await resetHighUsageTokens();

  try {
    // 1. Scrape
    const searchUrls = prepareSearchUrls(lookbackSeconds);
    const rawJobs = await scrapeJobs(searchUrls);
    const rawCount = rawJobs.length;
    console.log(`Scraped ${rawCount} total jobs`);

    if (rawCount === 0) {
      const stats: JobStats = { scraped: 0, duplicateRemoved: 0, dbDeduplicated: 0, keywordFiltered: 0, aiRejected: 0, matched: 0 };
      await sendMatchedJobs([], dateStr, stats);
      return response(200, 'No jobs scraped.');
    }

    // 2. Clean & Deduplicate (Batch)
    const uniqueRawJobs = getUniqueJobsFromBatch(rawJobs);
    const uniqueCount = uniqueRawJobs.length;
    const duplicateRemoved = rawCount - uniqueCount;
    console.log(`${uniqueCount} jobs after removing duplicate jobs from scrapper`);

    // 3. Filter against Database
    const existingData = await getExistingJobsData();
    const newJobs = uniqueRawJobs.filter((job: Job) => {
      const isNew = !existingData.links.has(job.link!) && !existingData.fingerprints.has(job.fingerprint!);
      return isNew;
    });
    const newCount = newJobs.length;
    const dbDeduplicated = uniqueCount - newCount;
    console.log(`${newCount} new jobs after DB deduplication.`);
    
    if (newCount === 0) {
      const stats: JobStats = { scraped: rawCount, duplicateRemoved, dbDeduplicated, keywordFiltered: 0, aiRejected: 0, matched: 0 };
      await sendMatchedJobs([], dateStr, stats);
      // await sendDroppedJobs(allDropped, dateStr);
      return response(200, 'All jobs already processed.');
    }

    // 4. Keyword Filter
    const { relevant: toCheck, binned: keywordBinned } = keywordFilter(newJobs);
    const toCheckCount = toCheck.length;
    const keywordFiltered = newCount - toCheckCount;
    for (const job of keywordBinned) {
      allDropped.push({ job, reason: `Keyword Binned: ${job.keyword_bin_reason || 'Skill mismatch'}` });
    }

    console.log(`${toCheckCount} jobs after keyword filtering`);

    if (toCheckCount === 0) {
      const stats: JobStats = {
        scraped: rawCount,
        duplicateRemoved,
        dbDeduplicated,
        keywordFiltered,
        aiRejected: 0,
        matched: 0
      };
      await sendMatchedJobs([], dateStr, stats);
      // await sendDroppedJobs(allDropped, dateStr);
      return response(200, 'All jobs filtered out by keywords.');
    }

    // 5. AI Relevance Check
    const { matched, rejected } = await checkRelevanceBatch(toCheck, OPENAI_BATCH_SIZE, BATCH_DELAY_MS);
    const matchedCount = matched.length;
    const aiRejected = toCheckCount - matchedCount;
    for (const job of rejected) {
      allDropped.push({ job, reason: `AI Rejected: ${job.ai_reason || 'Low relevance'}` });
    }

    console.log(`${matchedCount} jobs after LLM filtering`);

    // 6. Persist & Notify Matched
    await trackJobs(newJobs.map(j => ({ link: j.link!, fingerprint: j.fingerprint! })));

    // Send Matched Jobs to Telegram (Always called now)
    const stats: JobStats = {
      scraped: rawCount,
      duplicateRemoved,
      dbDeduplicated,
      keywordFiltered,
      aiRejected,
      matched: matchedCount
    };
    await sendMatchedJobs(matched, dateStr, stats);

    // Send All Dropped at once
    if(allDropped.length > 0) {
      console.log(`Total ${allDropped.length} jobs are dropped.`);
      // await sendDroppedJobs(allDropped, dateStr);
    }

    return response(200, {
      scraped: rawCount,
      new: newCount,
      matched: matchedCount,
      dropped: allDropped.length
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Lambda failed:', message);
    
    try {
      const failMsg = getFailureTelegramMessage(message, dateStr);
      await sendTelegramMessage(TELEGRAM_MATCHED_JOBS_BOT_TOKEN, TELEGRAM_MATCHED_JOBS_CHAT_ID, failMsg);
    } catch (teleErr) {
      console.error('Even Telegram notification failed:', teleErr);
    }

    return response(500, { error: message });
  }
};

function response(statusCode: number, body: unknown): APIGatewayProxyResult {
  return { statusCode, body: JSON.stringify(body) };
}

// @ts-ignore
async function sendDroppedJobs(dropped: { job: any, reason: string }[], dateStr: string) {
  if (dropped.length === 0) return;
  
  // Header
  await sendTelegramMessage(TELEGRAM_DROPPED_JOBS_BOT_TOKEN, TELEGRAM_DROPPED_JOBS_CHAT_ID, getDroppedHeader(dropped.length, dateStr));
  
  // Individual messages for each dropped job
  for (const item of dropped) {
    await sendTelegramMessage(TELEGRAM_DROPPED_JOBS_BOT_TOKEN, TELEGRAM_DROPPED_JOBS_CHAT_ID, getDroppedJobMessage(item.job, item.reason));
  }
}

async function sendMatchedJobs(matched: any[], dateStr: string, stats: JobStats) {
  if (matched.length === 0) {
    await sendTelegramMessage(TELEGRAM_MATCHED_JOBS_BOT_TOKEN, TELEGRAM_MATCHED_JOBS_CHAT_ID, getZeroMatchesMessage(dateStr, stats));
    return;
  }

  // Header
  await sendTelegramMessage(TELEGRAM_MATCHED_JOBS_BOT_TOKEN, TELEGRAM_MATCHED_JOBS_CHAT_ID, getSuccessHeader(dateStr, stats));

  // Individual messages for each matched job
  for (let i = 0; i < matched.length; i++) {
    await sendTelegramMessage(TELEGRAM_MATCHED_JOBS_BOT_TOKEN, TELEGRAM_MATCHED_JOBS_CHAT_ID, getMatchedJobMessage(matched[i], i + 1));
  }
}
