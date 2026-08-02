import { NaukriJobsQuery } from './services/naukri-scraper';
import { validateNaukriJobQueryOptions } from './services/naukri-validator';
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

  console.log(`[Naukri Lambda] Processing ${queries.length} query tasks`);

  let totalJobsFetched = 0;
  const uploadedKeys: string[] = [];

  try {
    for (let i = 0; i < queries.length; i++) {
      const task = queries[i];
      const validation = validateNaukriJobQueryOptions(task as unknown as Record<string, string>);

      if (!validation.valid || !validation.sanitizedOptions) {
        console.warn(`[Naukri Lambda] Skipping invalid query at index ${i}:`, validation.error);
        continue;
      }

      const query = new NaukriJobsQuery(validation.sanitizedOptions);
      const jobs = await query.getJobs();
      totalJobsFetched += jobs.length;

      const keys = await uploadScrapedJobsForUsers('naukri', task.keyword, task.location, task.userIds, jobs);
      uploadedKeys.push(...keys);
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, count: totalJobsFetched, uploadedKeysCount: uploadedKeys.length }),
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
    console.error(`[Naukri Lambda] Error:`, errorMessage);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: errorMessage }),
    };
  }
};
