import { LinkedInJobsQuery } from './services/linkedin-scraper';
import { validateJobQueryOptions } from './services/linkedin-validator';
import type { LambdaEvent, LambdaResponse } from './types/lambda-types';
import { uploadScrapedJobsForUsers } from './services/s3-uploader';

const getRandomJitter = (minMs = 300, maxMs = 800) =>
  new Promise((resolve) =>
    setTimeout(resolve, Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs)
  );

export const handler = async (event: LambdaEvent): Promise<LambdaResponse> => {
  const queries = event.queries;

  if (!queries || !Array.isArray(queries) || queries.length === 0) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: 'No valid queries array provided' }),
    };
  }

  console.log(`[LinkedIn Lambda] Processing ${queries.length} query tasks`);

  let totalJobsFetched = 0;
  const uploadedKeys: string[] = [];

  try {
    for (let i = 0; i < queries.length; i++) {
      const task = queries[i];
      const validation = validateJobQueryOptions(task as unknown as Record<string, string>);

      if (!validation.valid || !validation.sanitizedOptions) {
        console.warn(`[LinkedIn Lambda] Skipping invalid query at index ${i}:`, validation.error);
        continue;
      }

      const query = new LinkedInJobsQuery(validation.sanitizedOptions);
      const jobs = await query.getJobs();
      totalJobsFetched += jobs.length;

      const keys = await uploadScrapedJobsForUsers('linkedin', task.keyword, task.location, task.userIds, jobs);
      uploadedKeys.push(...keys);

      if (i < queries.length - 1) {
        await getRandomJitter(300, 800);
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, count: totalJobsFetched, uploadedKeysCount: uploadedKeys.length }),
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
    console.error(`[LinkedIn Lambda] Error:`, errorMessage);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: errorMessage }),
    };
  }
};
