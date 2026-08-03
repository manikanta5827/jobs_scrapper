/**
 * scraper_dispatcher.ts — ScraperDispatcherLambda Handler
 * Flow: Triggered by EventBridge cron at 11:00, 16:00, 20:00 -> Purges old unmatched -> Fetches Active Users
 * -> Deduplicates search queries across users -> Dispatches Scraper Lambdas asynchronously with userIds[] payload
 */

import type { ScheduledEvent, Context, APIGatewayProxyResult } from 'aws-lambda';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { purgeOldUnmatchedJobs, getActiveUsers, getUserById, checkAndHandleSubscriptionExpiry } from './services/db';
import { buildSearchQueriesFromProfile, type SearchQuery } from './services/job_fetcher';
import type { JobQueryOptions } from '../linkedin-scrapper/src/types/linkedin-types';
import type { NaukriJobQueryOptions } from '../linkedin-scrapper/src/types/naukri-types';

export type LinkedInDispatchedQuery = JobQueryOptions & { userIds: string[] };
export type NaukriDispatchedQuery = NaukriJobQueryOptions & { userIds: string[] };
export type DispatchedQuery = LinkedInDispatchedQuery | NaukriDispatchedQuery;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_MATCHED_JOBS_BOT_TOKEN || '';
const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION || 'ap-south-1' });

const LINKEDIN_SCRAPER_NAME = process.env.LINKEDIN_SCRAPER_FUNCTION_NAME || 'linkedin-jobs-scraper';
const NAUKRI_SCRAPER_NAME = process.env.NAUKRI_SCRAPER_FUNCTION_NAME || 'naukri-jobs-scraper';

export interface GroupedSearchQuery extends SearchQuery {
  platform: 'linkedin' | 'naukri';
  userIds: string[];
}

export const handler = async (
  event: { lookbackHours?: number; adminApiKey?: string; targetUserId?: string; includeFreeTier?: boolean } & Partial<ScheduledEvent>,
  _context: Context
): Promise<APIGatewayProxyResult> => {
  // Security check: verify admin API key matches configured secret when invoked via API
  if (event.adminApiKey && event.adminApiKey !== process.env.ADMIN_API_KEY) {
    console.warn('Unauthorized attempt to trigger ScraperDispatcherLambda');
    return response(401, { error: 'Unauthorized: Missing or invalid adminApiKey' });
  }

  console.log(`ScraperDispatcherLambda started at ${new Date().toISOString()}`);

  // 1. Purge 7-day-old unmatched jobs
  await purgeOldUnmatchedJobs(7);

  // 2. Fetch active users to process
  let usersToProcess: any[] = [];
  if (event.targetUserId) {
    const singleUser = await getUserById(event.targetUserId);
    if (singleUser && singleUser.isActive) usersToProcess.push(singleUser);
  } else {
    usersToProcess = await getActiveUsers();
  }

  if (usersToProcess.length === 0) {
    console.log('No active users to process.');
    return response(200, { message: 'No active users to process.' });
  }

  console.log(`Processing scraper dispatch for ${usersToProcess.length} active users.`);

  // Filter valid active users (check subscription expiry)
  const validUsers: any[] = [];
  for (const user of usersToProcess) {
    const isExpired = await checkAndHandleSubscriptionExpiry(user, TELEGRAM_BOT_TOKEN);
    if (isExpired) {
      console.log(`[ScraperDispatcher] Skipping scraper dispatch for user ${user.id} as premium subscription just expired.`);
      continue;
    }
    validUsers.push(user);
  }

  if (validUsers.length === 0) {
    console.log('No valid active users after subscription checks.');
    return response(200, { message: 'No valid active users after subscription checks.' });
  }

  // 3. Deduplicate queries across all valid users per platform
  const platforms = ['linkedin', 'naukri'] as const;
  const functionNames: Record<string, string> = {
    linkedin: LINKEDIN_SCRAPER_NAME,
    naukri: NAUKRI_SCRAPER_NAME,
  };

  const batchSizes: Record<string, number> = {
    linkedin: 10,
    naukri: 3,
  };

  let totalTasksCount = 0;

  for (const platform of platforms) {
    const groupedMap = new Map<string, GroupedSearchQuery>();
    let totalRawQueries = 0;

    for (const user of validUsers) {
      const userQueries = buildSearchQueriesFromProfile(user, platform);
      totalRawQueries += userQueries.length;
      for (const q of userQueries) {
        const key = `${q.keyword.toLowerCase().trim()}:${q.location.toLowerCase().trim()}`;
        if (!groupedMap.has(key)) {
          groupedMap.set(key, {
            platform,
            keyword: q.keyword,
            location: q.location,
            geoId: q.geoId,
            userIds: [user.id],
          });
        } else {
          groupedMap.get(key)!.userIds.push(user.id);
        }
      }
    }

    const uniquePlatformTasks = Array.from(groupedMap.values());
    totalTasksCount += uniquePlatformTasks.length;

    logDeduplicationStats(platform, validUsers, totalRawQueries, uniquePlatformTasks);

    const functionName = functionNames[platform];
    const batchSize = batchSizes[platform];

    const lookbackHours = (event.lookbackHours && event.lookbackHours > 0) ? event.lookbackHours : 24;
    await dispatchInBatches(functionName, platform, uniquePlatformTasks, batchSize, lookbackHours);
  }

  return response(200, {
    message: `Dispatched deduplicated scraper tasks for ${validUsers.length} active users successfully`,
    totalUsers: validUsers.length,
    totalDeduplicatedTasks: totalTasksCount,
  });
};

function logDeduplicationStats(
  platform: string,
  users: Array<{ id: string; suggestedJobTitles?: string[] | null }>,
  totalRawQueries: number,
  uniqueTasks: GroupedSearchQuery[],
): void {
  const SAMPLE_TITLES_PER_USER = 5;

  // Per-user sample titles (capped at 5 — same limit as query builder)
  const userTitleSamples = users.map((user) => ({
    userId: user.id,
    titles: (user.suggestedJobTitles ?? []).slice(0, SAMPLE_TITLES_PER_USER),
  }));

  // Keyword-level dedup (titles only, ignoring location)
  const allKeywords: string[] = [];
  for (const user of users) {
    for (const title of (user.suggestedJobTitles ?? []).slice(0, SAMPLE_TITLES_PER_USER)) {
      allKeywords.push(title.toLowerCase().trim());
    }
  }
  const uniqueKeywords = new Set(allKeywords);
  const duplicateKeywordCount = allKeywords.length - uniqueKeywords.size;

  // Query-level dedup (keyword + location — what actually drives scraper invocations)
  const uniqueQueryCount = uniqueTasks.length;
  const duplicateQueryCount = totalRawQueries - uniqueQueryCount;
  const mergedQueries = uniqueTasks
    .filter((t) => t.userIds.length > 1)
    .map((t) => ({
      keyword: t.keyword,
      location: t.location,
      sharedByUsers: t.userIds.length,
      userIds: t.userIds,
    }))
    .sort((a, b) => b.sharedByUsers - a.sharedByUsers);

  console.log(JSON.stringify({
    event: 'scraper_dedup_stats',
    platform,
    users: users.length,
    perUserTitleSamples: userTitleSamples,
    titles: {
      totalAcrossUsers: allKeywords.length,
      unique: uniqueKeywords.size,
      duplicates: duplicateKeywordCount,
      uniqueList: [...uniqueKeywords].sort(),
    },
    queries: {
      totalRaw: totalRawQueries,
      uniqueAfterDedup: uniqueQueryCount,
      duplicatesMerged: duplicateQueryCount,
      scraperCallsSaved: duplicateQueryCount,
      wouldHaveBeenWithoutDedup: totalRawQueries,
      actualScraperCalls: uniqueQueryCount,
    },
    mergedQueries: mergedQueries.slice(0, 20),
    mergedQueriesTruncated: mergedQueries.length > 20,
  }, null, 2));
}

async function dispatchInBatches(
  functionName: string,
  platform: 'linkedin' | 'naukri',
  tasks: GroupedSearchQuery[],
  batchSize: number,
  lookbackHours: number = 24
): Promise<void> {
  if (tasks.length === 0) return;

  const naukriDays = Math.max(1, Math.ceil(lookbackHours / 24));

  for (let i = 0; i < tasks.length; i += batchSize) {
    const batch = tasks.slice(i, i + batchSize);
    try {
      await lambdaClient.send(
        new InvokeCommand({
          FunctionName: functionName,
          InvocationType: 'Event', // Asynchronous execution
          Payload: Buffer.from(
            JSON.stringify({
              queries: batch.map((t): DispatchedQuery => {
                if (platform === 'linkedin') {
                  const query: LinkedInDispatchedQuery = {
                    keyword: t.keyword,
                    location: t.location,
                    geoId: t.geoId,
                    userIds: t.userIds,
                    sortBy: 'recent',
                    dateSincePosted: `${lookbackHours}hr`, // Dynamic hour string (e.g. 12hr -> r43200)
                  };
                  return query;
                } else {
                  const query: NaukriDispatchedQuery = {
                    keyword: t.keyword,
                    location: t.location,
                    userIds: t.userIds,
                    sort: 'date',
                    jobAge: naukriDays,                    // Converted to integer days for Naukri
                  };
                  return query;
                }
              }),
            })
          ),
        })
      );

      console.log(`[ScraperDispatcher] Dispatched ${functionName} batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(tasks.length / batchSize)} (${batch.length} queries)`);
    } catch (err: unknown) {
      console.error(`Failed to dispatch ${functionName}:`, err);
    }
  }
}

function response(statusCode: number, body: unknown): APIGatewayProxyResult {
  return { statusCode, body: JSON.stringify(body) };
}
