import type { ScheduledEvent, Context } from 'aws-lambda';
import { receiveJobBatchFromQueue, deleteMessageFromQueue, type PostMessage } from './services/sqs';

import { postToLinkedIn } from './services/linkedin';
import { formatJobPost } from './templates/linkedin';
import { getUserById } from './services/db';

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

interface SQSJobItem {
  message: PostMessage;
  receiptHandle: string;
}

// Process a single job post for a given user
async function processSingleJobPost(
  user: Awaited<ReturnType<typeof getUserById>>,
  item: SQSJobItem
): Promise<boolean> {
  const { message, receiptHandle } = item;
  const { job, userId } = message;
  const jobTitle = job.title || 'Unknown Job';

  if (!user) {
    console.warn(`User ID ${userId} not found in database for job "${jobTitle}". Deleting message.`);
    await deleteMessageFromQueue(receiptHandle);
    return false;
  }

  const linkedinCreds = user.linkedinCredentials as { accessToken?: string; personUrn?: string } | undefined;
  const token = linkedinCreds?.accessToken;
  const personUrn = linkedinCreds?.personUrn;

  if (!token || !personUrn) {
    console.log(`User ID ${user.id} (${user.email}) does not have custom LinkedIn credentials for job "${jobTitle}". Deleting message.`);
    await deleteMessageFromQueue(receiptHandle);
    return false;
  }

  let attempt = 0;
  let success = false;
  let lastStatus = 0;
  let lastError = '';

  while (!success && attempt < MAX_ATTEMPTS) {
    attempt++;
    if (attempt > 1) {
      const delay = RETRY_DELAYS_MS[attempt - 2];
      console.log(`Retry attempt ${attempt}/${MAX_ATTEMPTS} for "${jobTitle}" (User ${userId}) — waiting ${delay / 1000}s`);
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

      const postText = formatJobPost(job as any);
      const result = await postToLinkedIn(postText, token, personUrn, imageBuffer);
      success = result.success;
      lastStatus = result.status;
      lastError = result.error || '';
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      lastStatus = 0;
      console.error(`Attempt ${attempt} error for User ${userId}:`, lastError);
    }

    if (!success) {
      console.log(`Attempt ${attempt}/${MAX_ATTEMPTS} failed for User ${userId} — status: ${lastStatus}`);
    }
  }

  await deleteMessageFromQueue(receiptHandle);

  if (success) {
    console.log(`Posted "${jobTitle}" to LinkedIn for User ID ${user.id} (attempts: ${attempt})`);
    return true;
  }

  console.error(`LinkedIn post failed for User ID ${user.id} after ${MAX_ATTEMPTS} attempts — message deleted`);
  return false;
}

// Scheduled Lambda handler to post queued jobs to candidates' LinkedIn profiles in parallel
// Performs 1 post per user per 30-minute EventBridge run
export const handler = async (_event: ScheduledEvent, _context: Context) => {
  console.log('PostSchedulerLambda invoked', new Date().toISOString());

  // Batch fetch messages from SQS queue to discover queued users (up to 50 messages)
  const jobItems = await receiveJobBatchFromQueue(10, 5);
  if (jobItems.length === 0) {
    console.log('No jobs in queue, exiting');
    return { statusCode: 200, body: 'No jobs' };
  }

  console.log(`Retrieved ${jobItems.length} job message(s) from SQS. Grouping by userId...`);

  // Group messages by userId and pick only the FIRST (one) message per user for this 30-min run
  const userSingleJobMap = new Map<string, SQSJobItem>();
  for (const item of jobItems) {
    const uid = item.message.userId;
    // Only store the first message encountered for each user
    if (!userSingleJobMap.has(uid)) {
      userSingleJobMap.set(uid, item);
    }
  }

  console.log(`Found ${userSingleJobMap.size} distinct user(s). Processing 1 post per user in parallel...`);

  // ponytail: Process 1 post for each distinct user concurrently using Promise.all.
  // Each user gets exactly 1 post per 30-min run. Unprocessed messages remain in SQS for future scheduled runs.
  const userResults = await Promise.all(
    Array.from(userSingleJobMap.entries()).map(async ([userId, singleItem]) => {
      const user = await getUserById(userId);
      const jobTitle = singleItem.message.job.title || 'Unknown Job';
      const success = await processSingleJobPost(user, singleItem);

      return { userId, jobTitle, posted: success };
    })
  );

  console.log('PostScheduler execution complete:', JSON.stringify(userResults));
  return { statusCode: 200, body: JSON.stringify(userResults) };
};
