/**
 * s3_fetcher.ts
 * Helper to fetch scraped job batches from S3 and perform safe exact-key cleanup.
 */

import { S3Client, ListObjectsV2Command, GetObjectCommand, DeleteObjectsCommand, DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import type { Job } from '../types';
import { normalizeJob } from '../utils/job';

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'ap-south-1' });

/**
 * Uploads scraped jobs to S3 if a userId and S3_BUCKET_NAME are present.
 * Path format: raw-jobs/{userId}/{platform}-{timestamp}.json
 */
export async function uploadScrapedJobsToS3(
  platform: 'linkedin' | 'naukri' | 'simplyhired' | 'indeed',
  userId: string | undefined,
  jobs: unknown[]
): Promise<string | null> {
  const bucketName = process.env.S3_BUCKET_NAME;

  if (!userId || !bucketName) {
    if (!bucketName && userId) {
      console.warn(`[S3Uploader] S3_BUCKET_NAME env variable is not set. Skipping S3 upload for user ${userId}.`);
    }
    return null;
  }

  if (jobs.length === 0) {
    console.log(`[S3Uploader] No jobs scraped for ${platform}, skipping empty S3 upload.`);
    return null;
  }

  const timestamp = Date.now();
  const key = `raw-jobs/${userId}/${platform}-${timestamp}.json`;

  try {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: JSON.stringify(jobs),
        ContentType: 'application/json',
      })
    );
    console.log(`[S3Uploader] Successfully uploaded ${jobs.length} ${platform} jobs to s3://${bucketName}/${key}`);
    return key;
  } catch (err: unknown) {
    console.error(`[S3Uploader] Failed to upload ${platform} jobs to S3 for user ${userId}:`, err);
    return null;
  }
}

export async function fetchJobsFromS3(userId: string): Promise<{ jobs: Job[]; s3Keys: string[] }> {
  const bucketName = process.env.S3_BUCKET_NAME;
  if (!bucketName) {
    throw new Error('S3_BUCKET_NAME environment variable is not defined.');
  }

  const prefix = `raw-jobs/${userId}/`;
  const listCmd = new ListObjectsV2Command({
    Bucket: bucketName,
    Prefix: prefix,
  });

  const listRes = await s3Client.send(listCmd);
  const s3Keys = (listRes.Contents || []).map((item) => item.Key!).filter(Boolean);

  if (s3Keys.length === 0) {
    console.log(`[S3Fetcher] No scraped job batches found in S3 for user: ${userId}`);
    return { jobs: [], s3Keys: [] };
  }

  console.log(`[S3Fetcher] Found ${s3Keys.length} S3 batch files for user: ${userId}`);

  const allBatches = await Promise.all(
    s3Keys.map(async (key) => {
      try {
        const getCmd = new GetObjectCommand({
          Bucket: bucketName,
          Key: key,
        });
        const res = await s3Client.send(getCmd);
        const jsonText = await res.Body!.transformToString();
        const parsed = JSON.parse(jsonText);
        return (Array.isArray(parsed?.jobs) ? parsed.jobs : []) as Job[];
      } catch (err: unknown) {
        console.error(`[S3Fetcher] Failed to download or parse S3 key ${key}:`, err);
        return [] as Job[];
      }
    })
  );

  const jobs = allBatches.flatMap(batch => batch.map(normalizeJob));
  console.log(`[S3Fetcher] Downloaded ${jobs.length} total jobs across ${s3Keys.length} S3 files for user ${userId}`);

  return { jobs, s3Keys };
}

export async function deleteS3JobsBatch(s3Keys: string[]): Promise<void> {
  const bucketName = process.env.S3_BUCKET_NAME;
  if (!bucketName || s3Keys.length === 0) return;

  try {
    await s3Client.send(
      new DeleteObjectsCommand({
        Bucket: bucketName,
        Delete: {
          Objects: s3Keys.map((Key) => ({ Key })),
          Quiet: true,
        },
      })
    );
    console.log(`[S3Fetcher] Successfully deleted ${s3Keys.length} processed S3 batch files from bucket ${bucketName}`);
  } catch (err: unknown) {
    console.error(`[S3Fetcher] Failed to delete S3 batch files:`, err);
  }
}

export async function uploadJobDescription(
  userId: string,
  jobId: string,
  text: string
): Promise<string | null> {
  const bucketName = process.env.S3_BUCKET_NAME;
  if (!bucketName) {
    console.error('[S3] S3_BUCKET_NAME not set, cannot upload job description');
    return null;
  }
  if (!text) return null;

  // construct the key
  const key = `job-descriptions/${userId}/${jobId}.txt`;
  try {

    // uplaod to s3
    await s3Client.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: text,
      ContentType: 'text/plain',
    }));
    return key;
  } catch (err) {
    console.error(`[S3] Failed to upload job description for ${jobId}:`, err);
    return null;
  }
}

export async function getJobDescription(key: string): Promise<string | null> {
  const bucketName = process.env.S3_BUCKET_NAME;
  if (!bucketName || !key) return null;

  try {
    // get the description from s3
    const res = await s3Client.send(new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    }));
    return await res.Body!.transformToString();
  } catch (err) {
    console.error(`[S3] Failed to fetch job description for key ${key}:`, err);
    return null;
  }
}

export async function uploadJobAtsResume(
  userId: string,
  jobId: string,
  markdown: string
): Promise<string | null> {
  const bucketName = process.env.S3_BUCKET_NAME;
  if (!bucketName) {
    console.error('[S3] S3_BUCKET_NAME not set, cannot upload job resume');
    return null;
  }
  if (!markdown) return null;

  const key = `job-resumes/${userId}/${jobId}.txt`;
  try {
    // upload ats resume to s3
    await s3Client.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: markdown,
      ContentType: 'text/plain',
    }));
    return key;
  } catch (err) {
    console.error(`[S3] Failed to upload job resume for ${jobId}:`, err);
    return null;
  }
}

export async function getJobAtsResume(key: string): Promise<string | null> {
  const bucketName = process.env.S3_BUCKET_NAME;
  if (!bucketName || !key) return null;

  try {
    // get the ats resume
    const res = await s3Client.send(new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    }));
    return await res.Body!.transformToString();
  } catch (err) {
    console.error(`[S3] Failed to fetch job resume for key ${key}:`, err);
    return null;
  }
}

export async function uploadUserResume(
  userId: string,
  text: string
): Promise<string | null> {
  const bucketName = process.env.S3_BUCKET_NAME;
  if (!bucketName) {
    console.error('[S3] S3_BUCKET_NAME not set, cannot upload user resume');
    return null;
  }
  if (!text) return null;

  const key = `user-resumes/${userId}.txt`;
  try {
    await s3Client.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: text,
      ContentType: 'text/plain',
    }));
    return key;
  } catch (err) {
    console.error(`[S3] Failed to upload resume for user ${userId}:`, err);
    return null;
  }
}

export async function getUserResume(key: string): Promise<string | null> {
  const bucketName = process.env.S3_BUCKET_NAME;
  if (!bucketName || !key) return null;

  try {
    const res = await s3Client.send(new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    }));
    return await res.Body!.transformToString();
  } catch (err) {
    console.error(`[S3] Failed to fetch user resume for key ${key}:`, err);
    return null;
  }
}

export async function deleteUserResume(key: string): Promise<void> {
  const bucketName = process.env.S3_BUCKET_NAME;
  if (!bucketName || !key) return;

  try {
    await s3Client.send(new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key,
    }));
  } catch (err) {
    console.error(`[S3] Failed to delete user resume at key ${key}:`, err);
  }
}
