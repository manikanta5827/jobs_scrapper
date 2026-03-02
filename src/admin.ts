/**
 * admin.ts — Admin Lambda Handler
 * Provides a simple JSON-based API for managing Apify tokens.
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { 
  getAllApifyTokens, 
  addApifyToken, 
  deleteApifyToken, 
  updateApifyToken 
} from './helper/db_helper';
import { loadSecrets } from './helper/secret_helper';

await loadSecrets();

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const method = event.httpMethod;
  const body = event.body ? JSON.parse(event.body) : {};

  // 🛡️ Security Check
  const requestApiKey = event.headers['x-api-key'] || event.headers['X-Api-Key'];
  if (!requestApiKey || requestApiKey !== process.env.ADMIN_API_KEY) {
    console.warn('Unauthorized access attempt to Admin API');
    return response(401, { error: 'Unauthorized: Invalid or missing API Key' });
  }

  try {
    switch (method) {
      case 'GET': {
        const tokens = await getAllApifyTokens();
        return response(200, { tokens });
      }

      case 'POST': {
        if (!body.apiKey || !body.subscriptionStartDate) {
          return response(400, { error: 'Missing apiKey or subscriptionStartDate (YYYY-MM-DD)' });
        }
        const result = await addApifyToken(body.apiKey, body.subscriptionStartDate);
        return response(201, { message: 'Token added', result });
      }

      case 'PATCH': {
        if (!body.id) return response(400, { error: 'Missing token id' });
        const result = await updateApifyToken(body.id, body);
        return response(200, { message: 'Token updated', result });
      }

      case 'DELETE': {
        if (!body.id) return response(400, { error: 'Missing token id' });
        await deleteApifyToken(body.id);
        return response(200, { message: 'Token deleted' });
      }

      default:
        return response(405, { error: 'Method Not Allowed' });
    }
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
