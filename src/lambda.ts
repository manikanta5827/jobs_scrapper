/**
 * lambda.ts — Main Lambda Handler
 * Triggered by EventBridge daily at 2:00 AM UTC (7:30 AM IST)
 * Flow: Scrape → Clean/Dedup → DB Check → Keyword Filter → OpenAI AI Match → Notify
 */

import type { ScheduledEvent, Context, APIGatewayProxyResult } from 'aws-lambda';
import { scrapeJobs } from './helper/apify';
import { checkRelevanceBatch } from './helper/openai';
import { getExistingJobsData, trackJobs, insertMatchedJobs, cleanupOldSeenJobs } from './helper/db_helper';
import { loadSecrets } from './helper/secret_helper';
import { getUniqueJobsFromBatch } from './helper/job_utils';
import { keywordFilter, prepareSearchUrls } from './helper/filter';
import { sendTelegramMessage } from './helper/telegram_helper';
import { getSuccessTelegramMessage, getFailureTelegramMessage } from './helper/telegram_templates';
import type { Job } from './helper/types';

// ─── Config ──────────────────────────────────────────────────────────────────
const OPENAI_BATCH_SIZE = 10;
const BATCH_DELAY_MS = 3000;

await loadSecrets();
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID!;


// ─── Handler ─────────────────────────────────────────────────────────────────
export const handler = async (
  event: { lookbackHours?: number } & ScheduledEvent,
  _context: Context
): Promise<APIGatewayProxyResult> => {
  const lookbackHours = event.lookbackHours || 24;
  const lookbackSeconds = Math.floor(lookbackHours * 3600);
  const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  console.log(`Job scraper started. Lookback: ${lookbackHours}h`, new Date().toISOString());

  try {
    await cleanupOldSeenJobs();

    // 1. Scrape
    const searchUrls = prepareSearchUrls(lookbackSeconds);
    const rawJobs = await scrapeJobs(searchUrls);
    console.log(`Scraped ${rawJobs.length} total jobs`);

    if (rawJobs.length === 0) return response(200, 'No jobs scraped.');

    // 2. Clean & Deduplicate (Batch)
    const uniqueRawJobs = getUniqueJobsFromBatch(rawJobs);

    // 3. Filter against Database
    const existingData = await getExistingJobsData();
    const newJobs = uniqueRawJobs.filter((job: Job) => {
      return !existingData.links.has(job.link!) && !existingData.fingerprints.has(job.fingerprint!);
    });

    console.log(`${newJobs.length} new jobs after DB deduplication.`);
    if (newJobs.length === 0) return response(200, 'All jobs already processed.');

    // 4. Keyword Filter
    const { relevant: toCheck, binned: keywordBinned } = keywordFilter(newJobs);
    console.log(`Keyword filter: ${toCheck.length} passed, ${keywordBinned.length} auto-binned`);

    // 5. AI Relevance Check
    const { matched, rejected } = await checkRelevanceBatch(toCheck, OPENAI_BATCH_SIZE, BATCH_DELAY_MS);
    console.log(`OpenAI: ${matched.length} matched, ${rejected.length} rejected`);

    // 6. Persist & Notify
    await trackJobs(newJobs.map(j => ({ link: j.link!, fingerprint: j.fingerprint! })));

    if (matched.length > 0) {
      await insertMatchedJobs(matched);
      const telegramMsg = getSuccessTelegramMessage(matched, dateStr);
      await sendTelegramMessage(TELEGRAM_TOKEN, TELEGRAM_CHAT_ID, telegramMsg);
    }

    return response(200, {
      scraped: rawJobs.length,
      new: newJobs.length,
      matched: matched.length,
      binned: keywordBinned.length
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Lambda failed:', message);
    
    try {
      const failMsg = getFailureTelegramMessage(message, dateStr);
      await sendTelegramMessage(TELEGRAM_TOKEN, TELEGRAM_CHAT_ID, failMsg);
    } catch (teleErr) {
      console.error('Even Telegram notification failed:', teleErr);
    }

    return response(500, { error: message });
  }
};

function response(statusCode: number, body: unknown): APIGatewayProxyResult {
  return { statusCode, body: JSON.stringify(body) };
}
