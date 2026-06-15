/**
 * admin.ts — Admin Lambda Handler
 * Provides a simple JSON-based API for managing Apify tokens.
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const lambdaClient = new LambdaClient({});

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const method = event.httpMethod;
  const path = event.resource || event.path;
  const body = event.body ? JSON.parse(event.body) : {};

  // 🛡️ Security Check
  const requestApiKey = event.headers['x-api-key'] || event.headers['X-Api-Key'];
  if (!requestApiKey || requestApiKey !== process.env.ADMIN_API_KEY) {
    console.warn('Unauthorized access attempt to Admin API');
    return response(401, { error: 'Unauthorized: Invalid or missing API Key' });
  }

  try {
    // Trigger MainLambda asynchronously
    if (path === '/run') {
      if (method !== 'POST') return response(405, { error: 'Method Not Allowed' });

      const lookbackHours = body.lookbackHours ?? 24;
      await lambdaClient.send(new InvokeCommand({
        FunctionName: process.env.MAIN_LAMBDA_FUNCTION_NAME!,
        InvocationType: 'Event',
        Payload: JSON.stringify({ lookbackHours, adminApiKey: process.env.ADMIN_API_KEY }),
      }));

      return response(202, { message: 'MainLambda invoked', lookbackHours });
    }

    return response(404, { error: 'Not Found' });
  } catch (err: any) {
    console.error('Admin API error:', err);
    return response(500, { error: err.message });
  }
};

function response(statusCode: number, body: any): APIGatewayProxyResult {
  return {
    statusCode,
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' }
  };
}
