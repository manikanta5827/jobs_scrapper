/**
 * evaluator.ts — Isolated Per-User EvaluatorLambda Handler
 * Invoked asynchronously by EvaluatorDispatcherLambda. Handles S3 fetch, filtering, LLM evaluation, and cleanup for a single user.
 */

import type { Context } from 'aws-lambda';
import { fetchJobsFromS3, deleteS3JobsBatch, uploadJobDescription } from './services/s3';
import { checkRelevanceBatch, calculateCostUsd } from './services/llm';
import { 
  getExistingJobsData, 
  trackJobs, 
  getUserById,
  recordUserRun,
  batchUpdateJobS3DescriptionKeys
} from './services/db';
import { getUniqueJobsFromBatch } from './utils/job';
import { keywordFilter, companyBlockFilter, yoePreFilter, seniorityKeywordFilter } from './utils/filter';
import { sendTelegramMessage } from './services/telegram';
import { setTimeout as sleep } from 'node:timers/promises';
import pLimit from 'p-limit';
import { pushToPostQueue } from './services/sqs';
import { shutdownTelemetry } from './services/telemetry';
import { 
  getSuccessHeader, 
  getMatchedJobMessage,
  getZeroMatchesMessage
} from './templates/telegram';
import type { Job, EnrichedJob, JobStats } from './types';
import { Tier, TIER_CONFIG, PREMIUM_PRICE_MONTHLY_INR } from './constants';

const DEEPSEEK_BATCH_SIZE = 5;
const BATCH_DELAY_MS = 150;
const LLM_CONCURRENCY = 25;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_MATCHED_JOBS_BOT_TOKEN!;

// Fields that are always zero when a run exits before AI evaluation
const ZERO_COST = {
  matchedJobsCount: 0,
  rejectedJobsCount: 0,
  actualLlmCostUsd: 0,
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

  console.log(`EvaluatorLambda started for User ID: ${userId}. Lookback: ${lookbackHours}h`, new Date().toISOString());

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

  try {
    // 1. Fetch raw scraped job listings from S3 bucket
    console.time('fetch-s3-jobs');
    const { jobs: rawJobs, s3Keys } = await fetchJobsFromS3(user.id);
    const rawCount = rawJobs.length;
    console.timeEnd('fetch-s3-jobs');

    if (s3Keys.length === 0) {
      console.log(`User ${user.id}: No S3 batch files found.`);
      return { statusCode: 200, body: JSON.stringify({ status: 'SUCCESS', matched: 0 }) };
    }

    console.log(`User ${user.id}: Loaded ${rawCount} total jobs from S3`);

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
      await deleteS3JobsBatch(s3Keys);
      return { statusCode: 200, body: JSON.stringify({ status: 'SUCCESS', matched: 0 }) };
    }

    // 4. Batch deduplication (within single scraped batch)
    const uniqueRawJobs = getUniqueJobsFromBatch(jobsAfterBlock);
    const uniqueCount = uniqueRawJobs.length;
    const batchDedupCount = jobsAfterBlock.length - uniqueCount;

    console.log(`User ${user.id}: Deduped ${batchDedupCount} duplicate jobs, final jobs count ${uniqueCount}`);

    if (uniqueCount === 0) {
      const stats: JobStats = { scraped: rawCount, duplicateRemoved: batchDedupCount, dbDeduplicated: 0, keywordFiltered: 0, aiRejected: 0, matched: 0 };
      if (chatId) await sendMatchedJobs(TELEGRAM_BOT_TOKEN, chatId, [], dateStr, stats, user.tier);
      await recordUserRun(user.id, {
        status: 'SUCCESS',
        exitStage: 'batch_dedup',
        scrapedJobsCount: rawCount,
        batchDedupCount,
        dbDedupCount: 0,
        keywordFilteredCount: 0,
        ...ZERO_COST
      });
      await deleteS3JobsBatch(s3Keys);
      return { statusCode: 200, body: JSON.stringify({ status: 'SUCCESS', matched: 0 }) };
    }

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
      await deleteS3JobsBatch(s3Keys);
      return { statusCode: 200, body: JSON.stringify({ status: 'SUCCESS', matched: 0 }) };
    }

    // 5.5. Filter out outdated jobs (older than 14 days)
    const FRESHNESS_LIMIT_DAYS = 14;
    const nowMs = Date.now();
    const freshJobs = newJobs.filter((job: Job) => {
      if (!job.postedAt) return true;
      const postTime = new Date(job.postedAt).getTime();
      if (isNaN(postTime)) return true;
      const ageDays = (nowMs - postTime) / (1000 * 60 * 60 * 24);
      return ageDays <= FRESHNESS_LIMIT_DAYS;
    });
    const outdatedCount = newJobs.length - freshJobs.length;
    if (outdatedCount > 0) {
      console.log(`User ${user.id}: Filtered out ${outdatedCount} outdated jobs (older than ${FRESHNESS_LIMIT_DAYS} days)`);
    }

    // 6. Per-user Keyword Filtering (Exclude keywords)
    const excludeList = (user.excludeTitleKeywords as string[]) || [];
    console.log(`\n excluded keywords list :: ${excludeList} \n`);
    const { relevant: toCheck } = keywordFilter(freshJobs, excludeList);
    const toCheckCount = toCheck.length;
    const keywordFilteredCount = freshJobs.length - toCheckCount;

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
      await deleteS3JobsBatch(s3Keys);
      return { statusCode: 200, body: JSON.stringify({ status: 'SUCCESS', matched: 0 }) };
    }

    // 6b. Conservative YOE Pre-Filter (regex-based, skip LLM for clearly overqualified requirements)
    const candidateYoe = Math.ceil(user.experienceYears ?? 0);
    const { passToLLM: afterYoe, yoeRejected } = yoePreFilter(toCheck, candidateYoe);
    const yoeFilteredCount = yoeRejected.length;

    console.log(`User ${user.id}: YOE Filtered ${yoeFilteredCount} jobs (candidate has ${candidateYoe} yr), remaining ${afterYoe.length}`)

    // Print all the 'keywordBinReason' values inside the objects present in the yoeRejected array
    // console.log("YOE Rejected keywordBinReason(s):");
    // yoeRejected.forEach((job, idx) => {
    //   if (job.keywordBinReason) {
    //     console.log(`  [${idx}] keywordBinReason: ${job.keywordBinReason} for job title ${job.title} and link ${job.link}`);
    //   } else {
    //     console.log(`  [${idx}] No keywordBinReason present`);
    //   }
    // });
    
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
      await deleteS3JobsBatch(s3Keys);
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
      await deleteS3JobsBatch(s3Keys);
      return { statusCode: 200, body: JSON.stringify({ status: 'SUCCESS', matched: 0 }) };
    }

    const totalPreLlmFiltered = keywordFilteredCount + yoeFilteredCount + seniorityFilteredCount;

    // 7. DeepSeek AI Relevance Evaluation using candidate user profile and target parameters
    const { matched, rejected, usage } = await checkRelevanceBatch(afterSeniority, user, DEEPSEEK_BATCH_SIZE, BATCH_DELAY_MS, LLM_CONCURRENCY);
    const matchedCount = matched.length;
    const aiRejectedCount = rejected.length;

    console.log(`User ${user.id}: AI Rejected ${aiRejectedCount} irrelevant jobs, final jobs count ${matchedCount}`)

    // 8. Calculate actual DeepSeek LLM cost
    const actualLlmCostUsd = calculateCostUsd(usage);

    // 9. Persist LLM-evaluated jobs (matched + rejected) with full AI data for dedup and analytics.
    const evaluatedJobs = [...matched, ...rejected];
    const jobIdMap = await trackJobs(user.id, evaluatedJobs.map(j => ({
      link: j.link!,
      fingerprint: j.fingerprint!,
      jobTitle: j.title || j.jobTitle,
      companyName: j.companyName,
      location: j.location ?? j.aiJobLocation ?? undefined,
      postedAt: j.postedAt,
      salary: j.salary,
      aiScore: j.aiScore,
      aiReason: j.aiReason,
      jobDomain: j.jobDomain ?? null,
      minRequiredYoe: j.minRequiredYoe ?? null,
      maxRequiredYoe: j.maxRequiredYoe ?? null,
      requiredSkills: j.requiredSkills || [],
      preferredSkills: j.preferredSkills || [],
      candidateMatchedRequiredSkills: j.candidateMatchedRequiredSkills || [],
      candidateMatchedPreferredSkills: j.candidateMatchedPreferredSkills || [],
      candidateMissingRequiredSkills: j.candidateMissingRequiredSkills || [],
      candidateMissingPreferredSkills: j.candidateMissingPreferredSkills || [],
      domainMatchesCandidate: j.domainMatchesCandidate ?? false,
      aiJobLocation: j.aiJobLocation ?? null,
      directApply: j.aiDirectApply || j.applyUrl || null,
      applicantsCount: j.applicantsCount,
      source: j.source,
    })));

    // ponytail: Assign the persisted DB UUID to each evaluated job so Telegram buttons use UUIDs instead of scraper numeric IDs
    for (const j of [...matched, ...rejected]) {
      const dbUuid = (j.link && jobIdMap.get(j.link)) || (j.fingerprint && jobIdMap.get(j.fingerprint));
      if (dbUuid) {
        j.id = dbUuid;
      }
    }

    // Upload matched job descriptions to S3 in parallel, then batch-update DB
    const toUpload = matched.filter((j): j is typeof j & { id: string; descriptionText: string } =>
      !!j.descriptionText && !!j.id
    );

    // upload the descriptions to s3 and then upload to db
    if (toUpload.length > 0) {
      const s3UploadLimit = pLimit(10);
      const results = await Promise.all(
        toUpload.map(j =>
          s3UploadLimit(async () => {
            const s3Key = await uploadJobDescription(user.id, j.id, j.descriptionText);
            return s3Key ? { jobId: j.id, s3Key } as const : null;
          })
        )
      );
      const s3Entries = results.filter((r): r is { jobId: string; s3Key: string } => r !== null);
      if (s3Entries.length > 0) {
        await batchUpdateJobS3DescriptionKeys(s3Entries);
      }
    }

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

    // 13. Clean up processed S3 batch files (delete only the exact downloaded keys)
    await deleteS3JobsBatch(s3Keys);

    return { statusCode: 200, body: JSON.stringify({ status: 'SUCCESS', matched: matchedCount }) };

  } catch (userErr) {
    const rawMsg = userErr instanceof Error ? userErr.message : String(userErr);
    let detail = '';
    if (userErr instanceof Error && (userErr as unknown as Record<string, unknown>).cause) {
      const cause = (userErr as unknown as Record<string, unknown>).cause as Record<string, unknown>;
      if (cause?.code) detail += `code=${cause.code}; `;
      if (cause?.detail) detail += `detail=${String(cause.detail).slice(0, 300)}; `;
    }
    const errorMsg = `${rawMsg}${detail ? ` [${detail.trim().replace(/;$/, '')}]` : ''}`.slice(0, 1024);
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

  // Send individual job card messages sequentially to guarantee chat order matches rank.
  // A small randomized jitter (100–300ms) between sends avoids Telegram Bot API burst limits (429 Too Many Requests).
  for (let idx = 0; idx < matched.length; idx++) {
    await sendTelegramMessage(botToken, chatId, getMatchedJobMessage(matched[idx], idx + 1));
    const jitterMs = 100 + Math.floor(Math.random() * 200);
    await sleep(jitterMs);
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
