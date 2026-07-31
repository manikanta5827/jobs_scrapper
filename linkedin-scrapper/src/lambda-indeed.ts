import { queryIndeedJobs } from './indeed-scraper';
import { validateIndeedJobQueryOptions } from './indeed-validator';
import type { LambdaEvent, LambdaResponse } from './lambda-types';

export const handler = async (event: LambdaEvent): Promise<LambdaResponse> => {
  const queryParams = event.queryStringParameters || {};

  const validation = validateIndeedJobQueryOptions(queryParams);
  if (!validation.valid || !validation.sanitizedOptions) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: validation.error || 'Invalid parameters' }),
    };
  }

  try {
    const jobs = await queryIndeedJobs(validation.sanitizedOptions);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, count: jobs.length, data: jobs }),
    };
  } catch (error: any) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: error.message || 'Internal Server Error' }),
    };
  }
};
