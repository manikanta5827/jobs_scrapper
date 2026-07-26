/**
 * user_worker.ts — Isolated Per-User Worker Lambda Handler
 * Invoked asynchronously by MainLambda dispatcher. Handles full execution lifecycle for a single user.
 */

import type { Context } from 'aws-lambda';
import { fetchJobsForUser } from './helper/job_fetcher';
import { checkRelevanceBatch, calculateCostUsd } from './helper/llm';
import { 
  getExistingJobsData, 
  trackJobs, 
  getUserById,
  recordAndDeductUserRun 
} from './helper/db_helper';
import { getUniqueJobsFromBatch } from './helper/job_utils';
import { keywordFilter } from './helper/filter';
import { sendTelegramMessage } from './helper/telegram_helper';
import { pushToPostQueue } from './helper/sqs_helper';
import { 
  getSuccessHeader, 
  getMatchedJobMessage,
  getZeroMatchesMessage
} from './helper/telegram_templates';
import type { Job, JobStats } from './helper/types';

// Minimum required wallet balance before starting execution for a user ($0.1 USD)
const MIN_RUN_BALANCE = parseFloat(process.env.MIN_RUN_BALANCE ?? "0.1");
const DEEPSEEK_BATCH_SIZE = 5;
const BATCH_DELAY_MS = 3000;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_MATCHED_JOBS_BOT_TOKEN!;

export const handler = async (
  event: { userId: string; lookbackHours?: number },
  _context: Context
): Promise<{ statusCode: number; body: string }> => {
  const userId = event.userId;
  const lookbackHours = event.lookbackHours || 12;

  // Format current date and time in IST timezone (e.g. "24 Jul 2026, 09:00 AM IST")
  const dateStr = new Date().toLocaleString('en-IN', { 
    day: '2-digit', 
    month: 'short', 
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata'
  }) + ' IST';

  console.log(`UserWorkerLambda started for User ID: ${userId}. Lookback: ${lookbackHours}h`, new Date().toISOString());

  // Fetch candidate user record from database
  const user = await getUserById(userId);
  if (!user) {
    console.error(`User ID ${userId} not found in database.`);
    return { statusCode: 404, body: JSON.stringify({ error: `User ID ${userId} not found` }) };
  }


  if (!user.isActive) {
    console.log(`User ID ${userId} is inactive. Skipping worker execution.`);
    return { statusCode: 200, body: JSON.stringify({ status: 'SKIPPED_INACTIVE' }) };
  }

  const chatId = user.telegramChatId;

  // 1. Pre-Flight Wallet Balance Check
  if (user.balanceUsd < MIN_RUN_BALANCE) {
    console.warn(`User ${user.id} has low balance: $${user.balanceUsd}. Skipping execution.`);
    
    // Send low-balance Telegram alert directly to CANDIDATE user
    if (chatId) {
      const lowBalMsg = `⚠️ **Job Search Paused: Low Balance**\n` +
        `Your current wallet balance is **$${user.balanceUsd.toFixed(2)} USD** (Minimum required per run is **$${MIN_RUN_BALANCE.toFixed(2)} USD**).\n\n` +
        `Please contact Admin to recharge your account balance.`;
      await sendTelegramMessage(TELEGRAM_BOT_TOKEN, chatId, lowBalMsg);
    }

    // Record skipped run in user_runs audit table
    await recordAndDeductUserRun(user.id, {
      status: 'SKIPPED_LOW_BALANCE',
      scrapedJobsCount: 0,
      batchDedupCount:0,
      dbDedupCount: 0,
      keywordFilteredCount: 0,
      matchedJobsCount: 0,
      rejectedJobsCount: 0,
      actualLlmCostUsd: 0,
      actualApifyCostUsd: 0,
      errorMessage: 'Insufficient wallet balance'
    }, user.customRunCostUsd);

    return { statusCode: 200, body: JSON.stringify({ status: 'SKIPPED_LOW_BALANCE' }) };
  }

  try {
    // 2. Scrape job listings via unified Job Fetcher (uses SCRAPER_PROVIDER env var, default "lambda")
    console.time('fetch-users');
    const rawJobs = await fetchJobsForUser(user, lookbackHours);
    const rawCount = rawJobs.length;
    console.timeEnd('fetch-users');

    console.log(`User ${user.id}: Scraped ${rawCount} total jobs`);

    if (rawCount === 0) {
      const stats: JobStats = { scraped: 0, duplicateRemoved: 0, dbDeduplicated: 0, keywordFiltered: 0, aiRejected: 0, matched: 0 };
      if (chatId) await sendMatchedJobs(TELEGRAM_BOT_TOKEN, chatId, [], dateStr, stats);
      await recordAndDeductUserRun(user.id, {
        status: 'SUCCESS',
        scrapedJobsCount: 0,
        batchDedupCount: 0,
        dbDedupCount: 0,
        keywordFilteredCount: 0,
        matchedJobsCount: 0,
        rejectedJobsCount: 0,
        actualLlmCostUsd: 0,
        actualApifyCostUsd: 0
      }, user.customRunCostUsd);
      return { statusCode: 200, body: JSON.stringify({ status: 'SUCCESS', matched: 0 }) };
    }

    // 4. Batch deduplication (within single scraped batch)
    const uniqueRawJobs = getUniqueJobsFromBatch(rawJobs);
    const uniqueCount = uniqueRawJobs.length;
    const batchDedupCount = rawCount - uniqueCount;

    console.log(`User ${user.id}: Deduped ${batchDedupCount} duplicate jobs, final jobs count ${uniqueCount}`);

    // 5. Per-User Database deduplication (against candidate's personal seen jobs history)
    const existingData = await getExistingJobsData(user.id);
    const newJobs = uniqueRawJobs.filter((job: Job) => {
      return !existingData.links.has(job.link!) && !existingData.fingerprints.has(job.fingerprint!);
    });
    const newCount = newJobs.length;
    const dbDedupCount = uniqueCount - newCount;

    console.log(`User ${user.id}: DB deduped ${dbDedupCount} old jobs, final jobs count ${newCount}`);

    if (newCount === 0) {
      const stats: JobStats = { scraped: rawCount, duplicateRemoved: batchDedupCount, dbDeduplicated: dbDedupCount, keywordFiltered: 0, aiRejected: 0, matched: 0 };
      if (chatId) await sendMatchedJobs(TELEGRAM_BOT_TOKEN, chatId, [], dateStr, stats);
      await recordAndDeductUserRun(user.id, {
        status: 'SUCCESS',
        scrapedJobsCount: rawCount,
        batchDedupCount: batchDedupCount,
        dbDedupCount: dbDedupCount,
        keywordFilteredCount: 0,
        matchedJobsCount: 0,
        rejectedJobsCount: 0,
        actualLlmCostUsd: 0,
        actualApifyCostUsd: 0
      }, user.customRunCostUsd);
      return { statusCode: 200, body: JSON.stringify({ status: 'SUCCESS', matched: 0 }) };
    }

    // 6. Per-user Keyword Filtering (Exclude keywords)
    const excludeList = (user.excludeTitleKeywords as string[]) || [];
    const { relevant: toCheck } = keywordFilter(newJobs, excludeList);
    const toCheckCount = toCheck.length;
    const keywordFilteredCount = newCount - toCheckCount;

    console.log(`User ${user.id}: Keyword Filtered ${keywordFilteredCount} irrelevant jobs, final jobs count ${toCheckCount}`)

    if (toCheckCount === 0) {
      const stats: JobStats = { scraped: rawCount, duplicateRemoved: batchDedupCount, dbDeduplicated: dbDedupCount, keywordFiltered: keywordFilteredCount, aiRejected: 0, matched: 0 };
      if (chatId) await sendMatchedJobs(TELEGRAM_BOT_TOKEN, chatId, [], dateStr, stats);
      await recordAndDeductUserRun(user.id, {
        status: 'SUCCESS',
        scrapedJobsCount: rawCount,
        batchDedupCount: batchDedupCount,
        dbDedupCount: dbDedupCount,
        keywordFilteredCount: keywordFilteredCount,
        matchedJobsCount: 0,
        rejectedJobsCount: 0,
        actualLlmCostUsd: 0,
        actualApifyCostUsd: 0
      }, user.customRunCostUsd);
      return { statusCode: 200, body: JSON.stringify({ status: 'SUCCESS', matched: 0 }) };
    }

    // 7. DeepSeek AI Relevance Evaluation using candidate user profile and target parameters
    const { matched, usage } = await checkRelevanceBatch(toCheck, user, DEEPSEEK_BATCH_SIZE, BATCH_DELAY_MS);
    const matchedCount = matched.length;
    const aiRejectedCount = toCheckCount - matchedCount;

    console.log(`User ${user.id}: AI Rejected ${aiRejectedCount} irrelevant jobs, final jobs count ${matchedCount}`)

    // 8. Calculate actual DeepSeek LLM cost
    const actualLlmCostUsd = calculateCostUsd(usage);

    // 9. Persist newly discovered jobs into candidate's personal seen jobs ledger
    const matchedMap = new Map(matched.map(m => [m.link, m]));
    await trackJobs(user.id, newJobs.map(j => {
      const m = matchedMap.get(j.link);
      return {
        link: j.link!,
        fingerprint: j.fingerprint!,
        jobTitle: j.title || j.jobTitle,
        companyName: j.companyName,
        location: j.location || m?.ai_job_location || undefined,
        postedAt: j.postedAt,
        salary: j.salary,
        aiScore: m?.ai_score,
        aiReason: m?.ai_reason,
      };
    }));

    // 10. Audit log and deduct flat fee from user wallet
    await recordAndDeductUserRun(user.id, {
      status: 'SUCCESS',
      scrapedJobsCount: rawCount,
      batchDedupCount: batchDedupCount,
      dbDedupCount: dbDedupCount,
      keywordFilteredCount: keywordFilteredCount,
      matchedJobsCount: matchedCount,
      rejectedJobsCount: aiRejectedCount,
      actualLlmCostUsd,
      actualApifyCostUsd: 0
    }, user.customRunCostUsd);

    // 11. Send simplified matched jobs summary to CANDIDATE Telegram chat if Chat ID exists
    if (chatId) {
      const stats: JobStats = { scraped: rawCount, duplicateRemoved: batchDedupCount, dbDeduplicated: dbDedupCount, keywordFiltered: keywordFilteredCount, aiRejected: aiRejectedCount, matched: matchedCount };
      await sendMatchedJobs(TELEGRAM_BOT_TOKEN, chatId, matched, dateStr, stats);
    }

    // 12. Queue jobs to user's LinkedIn profile ONLY if candidate has custom OAuth credentials
    const userLinkedinCreds = user.linkedinCredentials as { accessToken?: string; personUrn?: string } | undefined;
    if (matched.length > 0 && userLinkedinCreds?.accessToken && userLinkedinCreds?.personUrn) {
      try {
        await pushToPostQueue('linkedin', user.id, matched);
        console.log(`Pushed ${matched.length} jobs to post queue for user ${user.id}`);
      } catch (queueErr) {
        console.error(`Failed to push to LinkedIn post queue for user ${user.id}:`, queueErr);
      }
    }

    return { statusCode: 200, body: JSON.stringify({ status: 'SUCCESS', matched: matchedCount }) };

  } catch (userErr) {
    const errorMsg = userErr instanceof Error ? userErr.message : String(userErr);
    console.error(`Execution failed for user ${user.id}:`, errorMsg);

    // Log failure in user_runs audit table
    await recordAndDeductUserRun(user.id, {
      status: 'FAILED',
      scrapedJobsCount: 0,
      batchDedupCount: 0,
      dbDedupCount: 0,
      keywordFilteredCount: 0,
      matchedJobsCount: 0,
      rejectedJobsCount: 0,
      actualLlmCostUsd: 0,
      actualApifyCostUsd: 0,
      errorMessage: errorMsg
    }, user.customRunCostUsd);

    throw userErr instanceof Error ? userErr : new Error(errorMsg);
  }
};

// Send matched jobs or zero-matches header message to candidate Telegram
async function sendMatchedJobs(botToken: string, chatId: string, matched: any[], dateStr: string, stats: JobStats) {
  if (!chatId) return;

  if (matched.length === 0) {
    await sendTelegramMessage(botToken, chatId, getZeroMatchesMessage(dateStr, stats));
    return;
  }

  // Send header stats message
  await sendTelegramMessage(botToken, chatId, getSuccessHeader(dateStr, stats));

  // Send individual job card messages
  for (let i = 0; i < matched.length; i++) {
    await sendTelegramMessage(botToken, chatId, getMatchedJobMessage(matched[i], i + 1));
  }
}
