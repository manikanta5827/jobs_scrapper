/**
 * scraper_dispatcher.ts — ScraperDispatcherLambda Handler
 * Flow: Triggered by EventBridge cron at 11:00, 16:00, 20:00 -> Purges old unmatched -> Fetches Active Users -> Asynchronously Fan-Out 4 Scraper Lambdas per user
 */

import type { ScheduledEvent, Context, APIGatewayProxyResult } from 'aws-lambda';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { purgeOldUnmatchedJobs, getActiveUsers, getUserById, checkAndHandleSubscriptionExpiry } from './helper/db_helper';
import { buildSearchQueriesFromProfile } from './helper/job_fetcher';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_MATCHED_JOBS_BOT_TOKEN || '';

const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION || 'ap-south-1' });

const LINKEDIN_SCRAPER_NAME = process.env.LINKEDIN_SCRAPER_FUNCTION_NAME || 'linkedin-jobs-scraper';
const NAUKRI_SCRAPER_NAME = process.env.NAUKRI_SCRAPER_FUNCTION_NAME || 'naukri-jobs-scraper';
const SIMPLYHIRED_SCRAPER_NAME = process.env.SIMPLYHIRED_SCRAPER_FUNCTION_NAME || 'simplyhired-jobs-scraper';
const INDEED_SCRAPER_NAME = process.env.INDEED_SCRAPER_FUNCTION_NAME || 'indeed-jobs-scraper';

export const handler = async (
  event: { lookbackHours?: number; adminApiKey?: string; targetUserId?: string; includeFreeTier?: boolean } & ScheduledEvent,
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

  console.log(`Dispatching scrapers for ${usersToProcess.length} active users.`);

  let totalDispatched = 0;

  for (const user of usersToProcess) {
    // 1. Subscription Expiry Check — auto-downgrade expired premium users to free tier and skip dispatching for this run
    const isExpired = await checkAndHandleSubscriptionExpiry(user, TELEGRAM_BOT_TOKEN);
    if (isExpired) {
      console.log(`[ScraperDispatcher] Skipping scraper dispatch for user ${user.id} as premium subscription just expired.`);
      continue;
    }

    const queries = buildSearchQueriesFromProfile(user);
    if (queries.length === 0) {
      console.warn(`[ScraperDispatcher] No search queries could be generated for user ${user.id}`);
      continue;
    }

    // LinkedIn & SimplyHired: 10 queries per Lambda batch
    await dispatchInBatches(LINKEDIN_SCRAPER_NAME, user.id, queries, 10);
    await dispatchInBatches(SIMPLYHIRED_SCRAPER_NAME, user.id, queries, 10);

    // Naukri & Indeed (browser-based): 3 queries per Lambda batch
    await dispatchInBatches(NAUKRI_SCRAPER_NAME, user.id, queries, 3);
    await dispatchInBatches(INDEED_SCRAPER_NAME, user.id, queries, 3);

    totalDispatched++;
  }

  return response(200, {
    message: `Dispatched scraper Lambdas for ${totalDispatched} active users successfully`,
    totalUsers: usersToProcess.length,
  });
};

async function dispatchInBatches(
  functionName: string,
  userId: string,
  queries: Array<{ keyword: string; location: string; geoId?: string }>,
  batchSize: number
): Promise<void> {
  for (let i = 0; i < queries.length; i += batchSize) {
    const batch = queries.slice(i, i + batchSize);
    try {
      await lambdaClient.send(
        new InvokeCommand({
          FunctionName: functionName,
          InvocationType: 'Event', // Asynchronous execution
          Payload: Buffer.from(
            JSON.stringify({
              userId,
              queries: batch,
            })
          ),
        })
      );
    } catch (err: unknown) {
      console.error(`Failed to dispatch ${functionName} for User ID ${userId}:`, err);
    }
  }
}

function response(statusCode: number, body: unknown): APIGatewayProxyResult {
  return { statusCode, body: JSON.stringify(body) };
}
