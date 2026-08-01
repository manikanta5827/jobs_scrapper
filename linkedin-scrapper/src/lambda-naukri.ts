import { NaukriJobsQuery } from './naukri-scraper';
import { validateNaukriJobQueryOptions } from './naukri-validator';
import type { LambdaEvent, LambdaResponse } from './lambda-types';

export const handler = async (event: LambdaEvent): Promise<LambdaResponse> => {
  let queryParams: any = event.queryStringParameters || {};
  if (Object.keys(queryParams).length === 0 && event.body) {
    try {
      queryParams = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    } catch {}
  }
  if (Object.keys(queryParams).length === 0 && ((event as any).keyword || (event as any).location)) {
    queryParams = event;
  }

  const validation = validateNaukriJobQueryOptions(queryParams);
  if (!validation.valid || !validation.sanitizedOptions) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: validation.error || 'Invalid parameters' }),
    };
  }

  try {
    const query = new NaukriJobsQuery(validation.sanitizedOptions);
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
