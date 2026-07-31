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
  recordUserRun,
  downgradeUserToFree
} from './helper/db_helper';
import { getUniqueJobsFromBatch } from './helper/job_utils';
import { keywordFilter, companyBlockFilter, yoePreFilter, seniorityKeywordFilter } from './helper/filter';
import { sendTelegramMessage } from './helper/telegram_helper';
import { pushToPostQueue } from './helper/sqs_helper';
import { shutdownTelemetry } from './helper/telemetry';
import { 
  getSuccessHeader, 
  getMatchedJobMessage,
  getZeroMatchesMessage
} from './helper/telegram_templates';
import type { Job, EnrichedJob, JobStats } from './helper/types';
import { Tier, TIER_CONFIG, PREMIUM_PRICE_MONTHLY_INR } from './helper/constants';

const DEEPSEEK_BATCH_SIZE = 10;
const BATCH_DELAY_MS = 3000;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_MATCHED_JOBS_BOT_TOKEN!;

// Fields that are always zero when a run exits before AI evaluation
const ZERO_COST = {
  matchedJobsCount: 0,
  rejectedJobsCount: 0,
  actualLlmCostUsd: 0,
  actualApifyCostUsd: 0,
  llmInputTokens: 0,
  llmInputCacheHitTokens: 0,
  llmOutputTokens: 0,
} as const;

export const handler = async (
  event: { userId: string; lookbackHours?: number },
  _context: Context
): Promise<{ statusCode: number; body: string }> => {
  try {
    return await processUserWorker(event, _context);
  } finally {
    await shutdownTelemetry();
  }
};

async function processUserWorker(
  event: { userId: string; lookbackHours?: number },
  _context: Context
): Promise<{ statusCode: number; body: string }> {
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

  // 1. Subscription Expiry Check — auto-downgrade expired premium users to free tier
  if (user.tier === Tier.PREMIUM && user.subscriptionExpiresAt) {
    const now = new Date();
    const expiresAt = new Date(user.subscriptionExpiresAt);
    if (now > expiresAt) {
      console.log(`User ${userId}: Premium subscription expired. Downgrading to free tier.`);
      const downgraded = await downgradeUserToFree(userId);
      if (downgraded && chatId) {
        const amountText = user.subscriptionAmount && user.subscriptionAmount > 0
          ? `₹${user.subscriptionAmount}/month`
          : 'Premium';
        const freeAlerts = TIER_CONFIG[Tier.FREE].alertsPerDay;
        await sendTelegramMessage(TELEGRAM_BOT_TOKEN, chatId,
          `⏰ <b>Subscription Expired</b>\nYour ${amountText} subscription has ended. You're now on the free tier (${freeAlerts} alert/day).\nContact admin to renew.`
        );
      }
      user.tier = Tier.FREE;
    }
  }

  try {
    // 2. Scrape job listings via unified Job Fetcher (uses SCRAPER_PROVIDER env var, default "lambda")
    console.time('fetch-users');
    const rawJobs = await fetchJobsForUser(user, lookbackHours);
    const rawCount = rawJobs.length;
    console.timeEnd('fetch-users');

    console.log(`User ${user.id}: Scraped ${rawCount} total jobs`);

    // 3. Filter out blocked companies (system-wide, before dedup)
    const { relevant: jobsAfterBlock } = companyBlockFilter(rawJobs);
    const blockedCount = rawCount - jobsAfterBlock.length;
    if (blockedCount > 0) {
      console.log(`User ${user.id}: Blocked ${blockedCount} jobs from blocked companies`);
    }

    if (jobsAfterBlock.length === 0) {
      const stats: JobStats = { scraped: rawCount, duplicateRemoved: 0, dbDeduplicated: 0, keywordFiltered: 0, aiRejected: 0, matched: 0 };
      if (chatId) await sendMatchedJobs(TELEGRAM_BOT_TOKEN, chatId, [], dateStr, stats, user.tier);
      await recordUserRun(user.id, {
        status: 'SUCCESS',
        exitStage: 'blocked_companies',
        scrapedJobsCount: rawCount,
        batchDedupCount: 0,
        dbDedupCount: 0,
        keywordFilteredCount: 0,
        ...ZERO_COST
      });
      return { statusCode: 200, body: JSON.stringify({ status: 'SUCCESS', matched: 0 }) };
    }

    // 4. Batch deduplication (within single scraped batch)
    const uniqueRawJobs = getUniqueJobsFromBatch(jobsAfterBlock);
    const uniqueCount = uniqueRawJobs.length;
    const batchDedupCount = jobsAfterBlock.length - uniqueCount;

    console.log(`User ${user.id}: Deduped ${batchDedupCount} duplicate jobs, final jobs count ${uniqueCount}`);

    // 5. Per-User Database deduplication (against candidate's personal seen jobs history — fingerprint only)
    const candidateFingerprints = uniqueRawJobs.map((j: Job) => j.fingerprint).filter((f): f is string => !!f);
    const existingFingerprints = await getExistingJobsData(user.id, candidateFingerprints);
    const newJobs = uniqueRawJobs.filter((job: Job) => {
      return !existingFingerprints.has(job.fingerprint!);
    });
    const newCount = newJobs.length;
    const dbDedupCount = uniqueCount - newCount;

    console.log(`User ${user.id}: DB deduped ${dbDedupCount} old jobs, final jobs count ${newCount}`);

    if (newCount === 0) {
      const stats: JobStats = { scraped: rawCount, duplicateRemoved: batchDedupCount, dbDeduplicated: dbDedupCount, keywordFiltered: 0, aiRejected: 0, matched: 0 };
      if (chatId) await sendMatchedJobs(TELEGRAM_BOT_TOKEN, chatId, [], dateStr, stats, user.tier);
      await recordUserRun(user.id, {
        status: 'SUCCESS',
        exitStage: 'db_dedup',
        scrapedJobsCount: rawCount,
        batchDedupCount,
        dbDedupCount,
        keywordFilteredCount: 0,
        ...ZERO_COST
      });
      return { statusCode: 200, body: JSON.stringify({ status: 'SUCCESS', matched: 0 }) };
    }

    // 6. Per-user Keyword Filtering (Exclude keywords)
    const excludeList = (user.excludeTitleKeywords as string[]) || [];
    console.log(`\n excluded keywords list :: ${excludeList} \n`);
    const { relevant: toCheck } = keywordFilter(newJobs, excludeList);
    const toCheckCount = toCheck.length;
    const keywordFilteredCount = newCount - toCheckCount;

    console.log(`User ${user.id}: Keyword Filtered ${keywordFilteredCount} irrelevant jobs, final jobs count ${toCheckCount}`)

    if (toCheckCount === 0) {
      const stats: JobStats = { scraped: rawCount, duplicateRemoved: batchDedupCount, dbDeduplicated: dbDedupCount, keywordFiltered: keywordFilteredCount, aiRejected: 0, matched: 0 };
      if (chatId) await sendMatchedJobs(TELEGRAM_BOT_TOKEN, chatId, [], dateStr, stats, user.tier);
      await recordUserRun(user.id, {
        status: 'SUCCESS',
        exitStage: 'keyword_filter',
        scrapedJobsCount: rawCount,
        batchDedupCount,
        dbDedupCount,
        keywordFilteredCount,
        ...ZERO_COST
      });
      return { statusCode: 200, body: JSON.stringify({ status: 'SUCCESS', matched: 0 }) };
    }

    // 6b. Conservative YOE Pre-Filter (regex-based, skip LLM for clearly overqualified requirements)
    const candidateYoe = Math.ceil(user.experienceYears ?? 0);
    const { passToLLM: afterYoe, yoeRejected } = yoePreFilter(toCheck, candidateYoe);
    const yoeFilteredCount = yoeRejected.length;

    console.log(`User ${user.id}: YOE Filtered ${yoeFilteredCount} jobs (candidate has ${candidateYoe} yr), remaining ${afterYoe.length}`)

    // Print all the 'keyword_bin_reason' values inside the objects present in the yoeRejected array
    console.log("YOE Rejected keyword_bin_reason(s):");
    yoeRejected.forEach((job, idx) => {
      if (job.keyword_bin_reason) {
        console.log(`  [${idx}] keyword_bin_reason: ${job.keyword_bin_reason}`);
      } else {
        console.log(`  [${idx}] No keyword_bin_reason present`);
      }
    });
    
    if (afterYoe.length === 0) {
      const preLlmFiltered = keywordFilteredCount + yoeFilteredCount;
      const stats: JobStats = { scraped: rawCount, duplicateRemoved: batchDedupCount, dbDeduplicated: dbDedupCount, keywordFiltered: preLlmFiltered, aiRejected: 0, matched: 0 };
      if (chatId) await sendMatchedJobs(TELEGRAM_BOT_TOKEN, chatId, [], dateStr, stats, user.tier);
      await recordUserRun(user.id, {
        status: 'SUCCESS',
        exitStage: 'yoe_filter',
        scrapedJobsCount: rawCount,
        batchDedupCount,
        dbDedupCount,
        keywordFilteredCount: preLlmFiltered,
        ...ZERO_COST
      });
      return { statusCode: 200, body: JSON.stringify({ status: 'SUCCESS', matched: 0 }) };
    }

    // 6c. Auto-derived Seniority Keyword Filter — exclude titles too senior for candidate's YOE
    const { relevant: afterSeniority, filtered: seniorityFiltered } = seniorityKeywordFilter(afterYoe, candidateYoe);
    const seniorityFilteredCount = seniorityFiltered.length;

    console.log(`User ${user.id}: Seniority Filtered ${seniorityFilteredCount} jobs, remaining ${afterSeniority.length}`)

    if (afterSeniority.length === 0) {
      const preLlmFiltered = keywordFilteredCount + yoeFilteredCount + seniorityFilteredCount;
      const stats: JobStats = { scraped: rawCount, duplicateRemoved: batchDedupCount, dbDeduplicated: dbDedupCount, keywordFiltered: preLlmFiltered, aiRejected: 0, matched: 0 };
      if (chatId) await sendMatchedJobs(TELEGRAM_BOT_TOKEN, chatId, [], dateStr, stats, user.tier);
      await recordUserRun(user.id, {
        status: 'SUCCESS',
        exitStage: 'seniority_filter',
        scrapedJobsCount: rawCount,
        batchDedupCount,
        dbDedupCount,
        keywordFilteredCount: preLlmFiltered,
        ...ZERO_COST
      });
      return { statusCode: 200, body: JSON.stringify({ status: 'SUCCESS', matched: 0 }) };
    }

    const totalPreLlmFiltered = keywordFilteredCount + yoeFilteredCount + seniorityFilteredCount;

    // 7. DeepSeek AI Relevance Evaluation using candidate user profile and target parameters
    const { matched, rejected, usage } = await checkRelevanceBatch(afterSeniority, user, DEEPSEEK_BATCH_SIZE, BATCH_DELAY_MS);
    const matchedCount = matched.length;
    const aiRejectedCount = rejected.length;

    console.log(`User ${user.id}: AI Rejected ${aiRejectedCount} irrelevant jobs, final jobs count ${matchedCount}`)

    // 8. Calculate actual DeepSeek LLM cost
    const actualLlmCostUsd = calculateCostUsd(usage);

    // 9. Persist all LLM-evaluated jobs into candidate's personal seen jobs ledger
    //    Both matched and rejected jobs are stored with full AI data for dedup and analytics.
    const evaluatedMap = new Map([...matched, ...rejected].map(j => [j.link, j]));
    await trackJobs(user.id, newJobs.map(j => {
      const m = evaluatedMap.get(j.link);
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
        matchedSkills: m?.ai_matched_skills || [],
        missingSkills: m?.ai_missing_skills || [],
        aiFacts: m?.ai_facts ?? null,
        requiredYoe: m?.ai_yoe,
        directApply: m?.ai_direct_apply || j.applyUrl || null,
        applicantsCount: j.applicantsCount,
        descriptionText: j.descriptionText,
        source: j._source,
      };
    }));

    // 10. Audit log
    await recordUserRun(user.id, {
      status: 'SUCCESS',
      exitStage: 'ai_evaluation',
      scrapedJobsCount: rawCount,
      batchDedupCount: batchDedupCount,
      dbDedupCount: dbDedupCount,
      keywordFilteredCount: keywordFilteredCount,
      matchedJobsCount: matchedCount,
      rejectedJobsCount: aiRejectedCount,
      actualLlmCostUsd,
      actualApifyCostUsd: 0,
      llmInputTokens: usage.promptCacheHitTokens + usage.promptCacheMissTokens,
      llmInputCacheHitTokens: usage.promptCacheHitTokens,
      llmOutputTokens: usage.completionTokens
    });

    // 11. Send simplified matched jobs summary to CANDIDATE Telegram chat if Chat ID exists
    if (chatId) {
      const stats: JobStats = { scraped: rawCount, duplicateRemoved: batchDedupCount, dbDeduplicated: dbDedupCount, keywordFiltered: totalPreLlmFiltered, aiRejected: aiRejectedCount, matched: matchedCount };
      await sendMatchedJobs(TELEGRAM_BOT_TOKEN, chatId, matched, dateStr, stats, user.tier);
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
    await recordUserRun(user.id, {
      status: 'FAILED',
      exitStage: 'catch_error',
      scrapedJobsCount: 0,
      batchDedupCount: 0,
      dbDedupCount: 0,
      keywordFilteredCount: 0,
      ...ZERO_COST,
      errorMessage: errorMsg
    });

    throw userErr instanceof Error ? userErr : new Error(errorMsg);
  }
};

// Send matched jobs or zero-matches header message to candidate Telegram
async function sendMatchedJobs(botToken: string, chatId: string, matched: EnrichedJob[], dateStr: string, stats: JobStats, tier: string) {
  if (!chatId) return;

  // Sort matched jobs by score descending so highest-rated appear first
  matched.sort((a, b) => (Number(b.aiScore ?? 0)) - (Number(a.aiScore ?? 0)));

  if (matched.length === 0) {
    await sendTelegramMessage(botToken, chatId, getZeroMatchesMessage(dateStr, stats));
    if (tier === Tier.FREE) {
      const premiumAlerts = TIER_CONFIG[Tier.PREMIUM].alertsPerDay;
      const freeAlerts = TIER_CONFIG[Tier.FREE].alertsPerDay;
      await sendTelegramMessage(botToken, chatId,
        `💡 <b>Want more job alerts?</b>\nUpgrade to Premium to get ${premiumAlerts} alerts daily instead of ${freeAlerts}.\nContact admin to upgrade.`
      );
    }
    return;
  }

  // Send header stats message
  await sendTelegramMessage(botToken, chatId, getSuccessHeader(dateStr, stats));

  // Send individual job card messages
  for (let i = 0; i < matched.length; i++) {
    await sendTelegramMessage(botToken, chatId, getMatchedJobMessage(matched[i], i + 1));
  }

  // Upgrade nudge for free tier users
  if (tier === Tier.FREE) {
    const premiumAlerts = TIER_CONFIG[Tier.PREMIUM].alertsPerDay;
    const freeAlerts = TIER_CONFIG[Tier.FREE].alertsPerDay;
    await sendTelegramMessage(botToken, chatId,
      `💡 <b>Want ${premiumAlerts - freeAlerts} more alerts today?</b>\nYou're on the Free tier (${freeAlerts} alert/day). Upgrade to Premium at ₹${PREMIUM_PRICE_MONTHLY_INR}/month and get ${premiumAlerts} job alerts daily.\nContact admin to upgrade.`
    );
  }
}
