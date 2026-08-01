import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({});

/**
 * Uploads scraped job results to S3 in a standardized format:
 * raw-jobs/{userId}/{platform}-{timestamp}.json
 */
export async function uploadScrapedJobsToS3(platform: string, userId: string | undefined, jobs: any[]): Promise<string> {
  const bucketName = process.env.S3_BUCKET_NAME;
  if (!bucketName) {
    console.warn('[S3Uploader] S3_BUCKET_NAME env variable is not defined. Skipping actual S3 upload (local test mode).');
    return `local-test/${userId || 'anonymous'}/${platform}-${Date.now()}.json`;
  }

  const uid = userId || 'anonymous';
  const timestamp = Date.now();
  const key = `raw-jobs/${uid}/${platform}-${timestamp}.json`;

  const payload = JSON.stringify({
    userId: uid,
    platform,
    scrapedAt: new Date().toISOString(),
    count: jobs.length,
    jobs
  }, null, 2);

  await s3Client.send(new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: payload,
    ContentType: 'application/json'
  }));

  console.log(`Uploaded ${jobs.length} raw jobs to S3: s3://${bucketName}/${key}`);
  return key;
}
