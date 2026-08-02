/**
 * scraper_dispatcher.ts — ScraperDispatcherLambda Handler
 * Flow: Triggered by EventBridge cron at 11:00, 16:00, 20:00 -> Purges old unmatched -> Fetches Active Users
 * -> Deduplicates search queries across users -> Dispatches Scraper Lambdas asynchronously with userIds[] payload
 */

import type { ScheduledEvent, Context, APIGatewayProxyResult } from 'aws-lambda';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { purgeOldUnmatchedJobs, getActiveUsers, getUserById, checkAndHandleSubscriptionExpiry } from './services/db';
import { buildSearchQueriesFromProfile, type SearchQuery } from './services/job_fetcher';

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

    for (const user of validUsers) {
      const userQueries = buildSearchQueriesFromProfile(user, platform);
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

    console.log(`[ScraperDispatcher] Platform ${platform}: Grouped ${validUsers.length} users into ${uniquePlatformTasks.length} deduplicated queries`);

    const functionName = functionNames[platform];
    const batchSize = batchSizes[platform];

    await dispatchInBatches(functionName, uniquePlatformTasks, batchSize);
  }

  return response(200, {
    message: `Dispatched deduplicated scraper tasks for ${validUsers.length} active users successfully`,
    totalUsers: validUsers.length,
    totalDeduplicatedTasks: totalTasksCount,
  });
};

async function dispatchInBatches(
  functionName: string,
  tasks: GroupedSearchQuery[],
  batchSize: number
): Promise<void> {
  if (tasks.length === 0) return;

  for (let i = 0; i < tasks.length; i += batchSize) {
    const batch = tasks.slice(i, i + batchSize);
    try {
      await lambdaClient.send(
        new InvokeCommand({
          FunctionName: functionName,
          InvocationType: 'Event', // Asynchronous execution
          Payload: Buffer.from(
            JSON.stringify({
              queries: batch.map(t => ({
                keyword: t.keyword,
                location: t.location,
                geoId: t.geoId,
                userIds: t.userIds,
              })),
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
