import { NaukriJobsQuery } from './naukri-scraper';
import { validateNaukriJobQueryOptions } from './naukri-validator';
import type { LambdaEvent, LambdaResponse } from './lambda-types';
import { uploadScrapedJobsToS3 } from './s3-uploader';

const getRandomJitter = (minMs = 1000, maxMs = 2000) =>
  new Promise((resolve) =>
    setTimeout(resolve, Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs)
  );

export const handler = async (event: LambdaEvent): Promise<LambdaResponse> => {
  let queries: Record<string, string>[] = [];
  let userId = event.userId;

  if (event.queries && Array.isArray(event.queries)) {
    queries = event.queries;
  } else if (event.body) {
    try {
      const parsed = JSON.parse(event.body);
      if (Array.isArray(parsed.queries)) queries = parsed.queries;
      if (parsed.userId) userId = parsed.userId;
    } catch {
      // Ignore JSON parse errors
    }
  }

  if (queries.length === 0 && event.queryStringParameters) {
    queries = [event.queryStringParameters];
    if (event.queryStringParameters.userId) {
      userId = event.queryStringParameters.userId;
    }
  } else if (queries.length === 0 && ((event as any).keyword || (event as any).location)) {
    queries = [event as any];
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
      const validation = validateNaukriJobQueryOptions(queryParams);

      if (!validation.valid || !validation.sanitizedOptions) {
        console.warn(`[Naukri Lambda] Skipping invalid query at index ${i}:`, validation.error);
        continue;
      }

      const query = new NaukriJobsQuery(validation.sanitizedOptions);
      const jobs = await query.getJobs();

      for (const job of jobs) {
        const jobId = job.id || job.jobUrl || job.position;
        if (jobId && !seenIds.has(jobId)) {
          seenIds.add(jobId);
          allJobs.push(job);
        }
      }

      if (i < queries.length - 1) {
        await getRandomJitter(1000, 2000);
      }
    }

    const s3Key = await uploadScrapedJobsToS3('naukri', userId, allJobs);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, count: allJobs.length, s3Key }),
    };
  } catch (error: any) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: error.message || 'Internal Server Error' }),
    };
  }
};
