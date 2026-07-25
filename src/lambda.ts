/**
 * lambda.ts — Dispatcher / Orchestrator Lambda Handler
 * Flow: Triggered by EventBridge cron → Reset expired tokens → Fetch Active Users → Asynchronously Fan-Out UserWorkerLambda per user
 */

import type { ScheduledEvent, Context, APIGatewayProxyResult } from 'aws-lambda';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { resetHighUsageTokens, purgeOldUnmatchedJobs, getActiveUsers, getUserById } from './helper/db_helper';

const lambdaClient = new LambdaClient({});

export const handler = async (
  event: { lookbackHours?: number; adminApiKey?: string; targetUserId?: string } & ScheduledEvent,
  _context: Context
): Promise<APIGatewayProxyResult> => {
  // Security check: verify admin API key matches configured secret
  const isAuthorized = event.adminApiKey === process.env.ADMIN_API_KEY;
  if (!isAuthorized) {
    console.warn('Unauthorized attempt to trigger MainLambda');
    return response(401, { error: 'Unauthorized: Missing or invalid adminApiKey' });
  }

  const lookbackHours = event.lookbackHours || 12;
  const workerFunctionName = process.env.USER_WORKER_FUNCTION_NAME!;

  console.log(`MainLambda Dispatcher started. Lookback: ${lookbackHours}h`, new Date().toISOString());

  // 1. Reset expired high-usage Apify tokens & purge 7-day-old unmatched jobs
  await resetHighUsageTokens();
  await purgeOldUnmatchedJobs(7);

  // Fetch active users to process
  let usersToProcess: any[] = [];
  if (event.targetUserId) {
    const singleUser = await getUserById(event.targetUserId);
    if (singleUser && singleUser.isActive) usersToProcess.push(singleUser);
  } else {
    usersToProcess = await getActiveUsers();
  }

  if (usersToProcess.length === 0) {
    console.log("No active users to process.");
    return response(200, { message: "No active users to process." });
  }

  console.log(`Dispatching ${usersToProcess.length} active users to UserWorkerLambda in parallel.`);

  // Fan-out: Invoke UserWorkerLambda asynchronously (InvocationType: 'Event') for each user
  const dispatchPromises = usersToProcess.map(async (user: any) => {
    try {
      await lambdaClient.send(new InvokeCommand({
        FunctionName: workerFunctionName,
        InvocationType: 'Event', // Asynchronous execution
        Payload: JSON.stringify({ userId: user.id, lookbackHours }),
      }));
      console.log(`Dispatched UserWorkerLambda for User ID: ${user.id} (${user.email})`);
      return { userId: user.id, dispatched: true };
    } catch (err: any) {
      console.error(`Failed to dispatch UserWorkerLambda for User ID ${user.id}:`, err);
      throw err;
    }
  });

  const results = await Promise.all(dispatchPromises);

  return response(200, { 
    message: `Dispatched ${usersToProcess.length} user workers successfully`, 
    results 
  });
};

// Helper function to structure APIGatewayProxyResult
function response(statusCode: number, body: unknown): APIGatewayProxyResult {
  return { statusCode, body: JSON.stringify(body) };
}
