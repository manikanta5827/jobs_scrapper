/**
 * evaluator_dispatcher.ts — Evaluator Dispatcher Lambda Handler
 * Flow: Triggered by EventBridge cron (11:30, 16:30, 20:30 IST) → Fetch Active Users → Asynchronously fan-out EvaluatorLambda per user
 */

import type { ScheduledEvent, Context, APIGatewayProxyResult } from 'aws-lambda';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { getActiveUsersMinimal, getUserMinimal } from './services/db';
import { Tier } from './constants';

const lambdaClient = new LambdaClient({});

export const handler = async (
  event: { lookbackHours?: number; adminApiKey?: string; targetUserId?: string; includeFreeTier?: boolean } & Partial<ScheduledEvent>,
  _context: Context
): Promise<APIGatewayProxyResult> => {
  // Security check for manual API invocations
  if (event.adminApiKey && event.adminApiKey !== process.env.ADMIN_API_KEY) {
    console.warn('Unauthorized attempt to trigger EvaluatorDispatcherLambda');
    return response(401, { error: 'Unauthorized: Missing or invalid adminApiKey' });
  }

  const lookbackHours = event.lookbackHours || 12;
  const includeFreeTier = event.includeFreeTier || false;
  const workerFunctionName = process.env.EVALUATOR_FUNCTION_NAME!;

  console.log(`EvaluatorDispatcherLambda started. Lookback: ${lookbackHours}h, IncludeFreeTier: ${includeFreeTier}`, new Date().toISOString());

  // Fetch active users to process
  type MinimalUser = { id: string; email: string; isActive: boolean; telegramChatId?: string | null; tier: string; subscriptionExpiresAt?: Date | null };
  let usersToProcess: MinimalUser[] = [];
  if (event.targetUserId) {
    const user = await getUserMinimal(event.targetUserId);
    if (user && user.isActive) usersToProcess.push(user);
  } else if (includeFreeTier) {
    usersToProcess = await getActiveUsersMinimal(); // all active (free + premium)
  } else {
    usersToProcess = await getActiveUsersMinimal(Tier.PREMIUM); // premium only
  }

  if (usersToProcess.length === 0) {
    console.log("No active users to process.");
    return response(200, { message: "No active users to process." });
  }

  console.log(`Dispatching ${usersToProcess.length} active users to EvaluatorLambda (${workerFunctionName}) in parallel.`);

  // Fan-out: Invoke EvaluatorLambda asynchronously (InvocationType: 'Event') for each user
  const dispatchPromises = usersToProcess.map(async (user: MinimalUser) => {
    try {
      await lambdaClient.send(new InvokeCommand({
        FunctionName: workerFunctionName,
        InvocationType: 'Event', // Asynchronous execution
        Payload: JSON.stringify({ userId: user.id, lookbackHours }),
      }));
      console.log(`Dispatched EvaluatorLambda for User ID: ${user.id} (${user.email}) [tier: ${user.tier}]`);
      return { userId: user.id, dispatched: true };
    } catch (err: unknown) {
      console.error(`Failed to dispatch EvaluatorLambda for User ID ${user.id}:`, err);
      throw err;
    }
  });

  const results = await Promise.all(dispatchPromises);

  return response(200, { 
    message: `Dispatched ${usersToProcess.length} user worker evaluators successfully`, 
    results 
  });
};

// Helper function to structure APIGatewayProxyResult
function response(statusCode: number, body: unknown): APIGatewayProxyResult {
  return { statusCode, body: JSON.stringify(body) };
}
