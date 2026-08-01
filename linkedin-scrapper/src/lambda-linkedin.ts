import { LinkedInJobsQuery } from './scraper';
import { validateJobQueryOptions } from './validator';
import type { LambdaEvent, LambdaResponse } from './lambda-types';

const getRandomJitter = (minMs = 300, maxMs = 800) =>
  new Promise((resolve) =>
    setTimeout(resolve, Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs)
  );

export const handler = async (event: LambdaEvent): Promise<LambdaResponse> => {
  let queries: Record<string, string>[] = [];

  if (event.queries && Array.isArray(event.queries)) {
    queries = event.queries;
  } else if (event.body) {
    try {
      const parsed = JSON.parse(event.body);
      if (Array.isArray(parsed.queries)) queries = parsed.queries;
    } catch {
      // Ignore JSON parse errors
    }
  }

  if (queries.length === 0 && event.queryStringParameters) {
    queries = [event.queryStringParameters];
  }

  if (queries.length === 0) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: 'No valid query parameters or batch queries provided' }),
    };
  }

  const allJobs: any[] = [];
  const seenIds = new Set<string>();

  try {
    for (let i = 0; i < queries.length; i++) {
      const queryParams = queries[i];
      const validation = validateJobQueryOptions(queryParams);

      if (!validation.valid || !validation.sanitizedOptions) {
        console.warn(`[LinkedIn Lambda] Skipping invalid query at index ${i}:`, validation.error);
        continue;
      }

      const query = new LinkedInJobsQuery(validation.sanitizedOptions);
      const jobs = await query.getJobs();

      for (const job of jobs) {
        const jobId = job.id || job.jobUrl;
        if (jobId && !seenIds.has(jobId)) {
          seenIds.add(jobId);
          allJobs.push(job);
        }
      }

      // Apply randomized jitter delay between sequential requests to prevent rate limits
      if (i < queries.length - 1) {
        await getRandomJitter(300, 800);
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, count: allJobs.length, data: allJobs }),
    };
  } catch (error: any) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: error.message || 'Internal Server Error' }),
    };
  }
};
