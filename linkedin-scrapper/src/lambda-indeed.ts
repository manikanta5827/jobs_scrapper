import { queryIndeedJobs } from './services/indeed-scraper';
import { validateIndeedJobQueryOptions } from './services/indeed-validator';
import type { LambdaEvent, LambdaResponse } from './types/lambda-types';
import { uploadScrapedJobsForUsers } from './services/s3-uploader';

export const handler = async (event: LambdaEvent): Promise<LambdaResponse> => {
  const queries = event.queries;

  if (!queries || !Array.isArray(queries) || queries.length === 0) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: 'No valid queries array provided' }),
    };
  }

  console.log(`[Indeed Lambda] Processing ${queries.length} query tasks`);

  let totalJobsFetched = 0;
  const uploadedKeys: string[] = [];

  try {
    for (let i = 0; i < queries.length; i++) {
      const task = queries[i];
      const validation = validateIndeedJobQueryOptions(task as unknown as Record<string, string>);

      if (!validation.valid || !validation.sanitizedOptions) {
        console.warn(`[Indeed Lambda] Skipping invalid query at index ${i}:`, validation.error);
        continue;
      }

      const jobs = await queryIndeedJobs(validation.sanitizedOptions);
      totalJobsFetched += jobs.length;

      const keys = await uploadScrapedJobsForUsers('indeed', task.keyword, task.location, task.userIds, jobs);
      uploadedKeys.push(...keys);
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, count: totalJobsFetched, uploadedKeysCount: uploadedKeys.length }),
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
    console.error(`[Indeed Lambda] Error:`, errorMessage);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: errorMessage }),
    };
  }
};
