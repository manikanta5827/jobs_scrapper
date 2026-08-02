import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({});

/**
 * Uploads scraped job results to S3 in the standardized path:
 * raw-jobs/{userId}/{platform}-{timestamp}.json
 */
export async function uploadScrapedJobsForUsers(
  platform: string,
  keyword: string,
  location: string,
  userIds: string[] | undefined,
  jobs: any[]
): Promise<string[]> {
  const bucketName = process.env.S3_BUCKET_NAME || process.env.RAW_DATA_BUCKET;
  if (!bucketName) {
    console.warn('[S3Uploader] S3_BUCKET_NAME / RAW_DATA_BUCKET env variable is not defined. Skipping actual S3 upload.');
    return [];
  }

  if (jobs.length === 0 || !userIds || userIds.length === 0) {
    console.warn(`[S3Uploader] No jobs or userIds for platform ${platform} (${keyword}). Skipping S3 upload.`);
    return [];
  }

  const payload = JSON.stringify({
    platform,
    keyword,
    location,
    scrapedAt: new Date().toISOString(),
    count: jobs.length,
    jobs
  }, null, 2);
  
  const uploadedKeys: string[] = [];

  // Parallel S3 upload for each user in userIds under raw-jobs/{userId}/
  const uploadPromises = userIds.map(async (userId) => {
    const timestamp = Date.now();
    const key = `raw-jobs/${userId}/${platform}-${timestamp}.json`;
    await s3Client.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: payload,
      ContentType: 'application/json',
    }));
    uploadedKeys.push(key);
  });

  await Promise.all(uploadPromises);
  console.log(`[S3Uploader] Uploaded ${jobs.length} jobs to S3 for ${userIds.length} users (${platform}:${keyword}:${location})`);
  return uploadedKeys;
}
