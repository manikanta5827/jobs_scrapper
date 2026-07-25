import type { ScheduledEvent, Context } from 'aws-lambda';
import { receiveJobFromQueue, deleteMessageFromQueue } from './helper/sqs_helper';

import { postToLinkedIn } from './helper/linkedin_post';
import { formatJobPost } from './helper/linkedin_templates';
import { getUserById } from './helper/db_helper';


const IMAGE_WORKER_URL = process.env.CLOUDFLARE_IMAGE_WORKER_URL;
const RETRY_DELAYS_MS = [30_000, 60_000, 120_000];
const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

// Fetch company name image preview from Cloudflare Worker
async function fetchCompanyImage(companyName: string): Promise<Buffer> {
  if (!IMAGE_WORKER_URL) throw new Error('CLOUDFLARE_IMAGE_WORKER_URL is not set');

  const url = new URL(IMAGE_WORKER_URL);
  url.searchParams.set('text', companyName);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Image worker returned ${res.status}: ${await res.text()}`);

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// Scheduled Lambda handler to post queued jobs to candidate's LinkedIn profile
export const handler = async (_event: ScheduledEvent, _context: Context) => {
  console.log('PostSchedulerLambda invoked', new Date().toISOString());

  // Receive next job message from SQS queue
  const jobMsg = await receiveJobFromQueue();
  if (!jobMsg) {
    console.log('No jobs in queue, exiting');
    return { statusCode: 200, body: 'No jobs' };
  }

  const { message, receiptHandle } = jobMsg;
  const { job, userId } = message;
  const jobTitle = job.title || 'Unknown Job';

  // Fetch fresh candidate user details & OAuth tokens directly from database by userId
  const user = await getUserById(userId);
  if (!user) {
    console.warn(`User ID ${userId} not found in database for job "${jobTitle}". Deleting message.`);
    await deleteMessageFromQueue(receiptHandle);
    return { statusCode: 200, body: 'User not found' };
  }

  const linkedinCreds = user.linkedinCredentials as { accessToken?: string; personUrn?: string } | undefined;
  const token = linkedinCreds?.accessToken;
  const personUrn = linkedinCreds?.personUrn;


  // Skip posting if user does not have custom LinkedIn credentials in database
  if (!token || !personUrn) {
    console.log(`User ID ${user.id} (${user.email}) does not have custom LinkedIn credentials for job "${jobTitle}". Deleting message.`);
    await deleteMessageFromQueue(receiptHandle);
    return { statusCode: 200, body: 'Skipped: Candidate has no LinkedIn credentials' };
  }

  let attempt = 0;
  let success = false;
  let lastStatus = 0;
  let lastError = '';

  // Retry loop for posting job to candidate's LinkedIn profile
  while (!success && attempt < MAX_ATTEMPTS) {
    attempt++;
    if (attempt > 1) {
      const delay = RETRY_DELAYS_MS[attempt - 2];
      console.log(`Retry attempt ${attempt}/${MAX_ATTEMPTS} for "${jobTitle}" — waiting ${delay / 1000}s`);
      await new Promise(r => setTimeout(r, delay));
    }

    try {
      let imageBuffer: Buffer | undefined;
      const companyName = job.companyName || '';
      if (companyName && IMAGE_WORKER_URL) {
        try {
          imageBuffer = await fetchCompanyImage(companyName);
          console.log(`Fetched image for "${companyName}" from worker (${imageBuffer.length} bytes)`);
        } catch (imgErr) {
          console.warn(`Image fetch failed for "${jobTitle}", posting text-only:`, imgErr);
        }
      }

      // Format post text and call LinkedIn API with candidate credentials
      const postText = formatJobPost(job as any);
      const result = await postToLinkedIn(postText, token, personUrn, imageBuffer);
      success = result.success;
      lastStatus = result.status;
      lastError = result.error || '';
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      lastStatus = 0;
      console.error(`Attempt ${attempt} error:`, lastError);
    }

    if (!success) {
      console.log(`Attempt ${attempt}/${MAX_ATTEMPTS} failed — status: ${lastStatus}`);
    }
  }

  // Delete message from queue upon successful posting
  if (success) {
    await deleteMessageFromQueue(receiptHandle);
    console.log(`Posted "${jobTitle}" to LinkedIn for User ID ${user.id} (attempts: ${attempt})`);
    return { statusCode: 200, body: `Posted to LinkedIn: ${jobTitle}` };
  }

  // Delete message from queue after max attempts failed
  await deleteMessageFromQueue(receiptHandle);

  console.error(`LinkedIn post failed after ${MAX_ATTEMPTS} attempts — message deleted`);
  throw new Error(`LinkedIn failed: ${lastStatus} - ${lastError}`);
};
