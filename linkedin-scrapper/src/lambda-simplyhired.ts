import { SimplyHiredJobsQuery } from './simplyhired-scraper';
import { validateSimplyHiredJobQueryOptions } from './simplyhired-validator';
import type { LambdaEvent, LambdaResponse } from './lambda-types';

export const handler = async (event: LambdaEvent): Promise<LambdaResponse> => {
  const queryParams = event.queryStringParameters || {};

  const validation = validateSimplyHiredJobQueryOptions(queryParams);
  if (!validation.valid || !validation.sanitizedOptions) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: validation.error || 'Invalid parameters' }),
    };
  }

  try {
    const query = new SimplyHiredJobsQuery(validation.sanitizedOptions);
    const jobs = await query.getJobs();

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
