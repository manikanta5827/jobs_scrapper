import type { ScheduledEvent, Context } from 'aws-lambda';
import { receiveJobFromQueue, deleteMessageFromQueue } from './helper/sqs_helper';
import { sendTelegramMessage } from './helper/telegram_helper';
import { getPlatformPostFailedMessage, getPlatformTokenExpiredMessage } from './helper/telegram_templates';
import { postToLinkedIn } from './helper/linkedin_post';
import { formatJobPost } from './helper/linkedin_templates';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_MATCHED_JOBS_BOT_TOKEN!;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_MATCHED_JOBS_CHAT_ID!;
const IMAGE_WORKER_URL = process.env.CLOUDFLARE_IMAGE_WORKER_URL;

const RETRY_DELAYS_MS = [30_000, 60_000, 120_000];
const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

async function fetchCompanyImage(companyName: string): Promise<Buffer> {
  if (!IMAGE_WORKER_URL) throw new Error('CLOUDFLARE_IMAGE_WORKER_URL is not set');

  const url = new URL(IMAGE_WORKER_URL);
  url.searchParams.set('text', companyName);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Image worker returned ${res.status}: ${await res.text()}`);

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export const handler = async (_event: ScheduledEvent, _context: Context) => {
  console.log('PostSchedulerLambda invoked', new Date().toISOString());

  const jobMsg = await receiveJobFromQueue();
  if (!jobMsg) {
    console.log('No jobs in queue, exiting');
    return { statusCode: 200, body: 'No jobs' };
  }

  const { message, receiptHandle } = jobMsg;
  const { job } = message;
  const jobTitle = job.title || 'Unknown Job';

  let attempt = 0;
  let success = false;
  let lastStatus = 0;
  let lastError = '';

  while (!success && attempt < MAX_ATTEMPTS) {
    attempt++;
    if (attempt > 1) {
      const delay = RETRY_DELAYS_MS[attempt - 2];
      console.log(`Retry attempt ${attempt}/${MAX_ATTEMPTS} for "${jobTitle}" — waiting ${delay / 1000}s`);
      await new Promise(r => setTimeout(r, delay));
    }

    try {
      const token = process.env.LINKEDIN_ACCESS_TOKEN;
      if (!token) throw new Error('LINKEDIN_ACCESS_TOKEN is not set');
      const personUrn = process.env.LINKEDIN_PERSON_URN!;

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
      console.error(`Attempt ${attempt} error:`, lastError);
    }

    if (!success) {
      console.log(`Attempt ${attempt}/${MAX_ATTEMPTS} failed — status: ${lastStatus}`);
    }
  }

  if (success) {
    await deleteMessageFromQueue(receiptHandle);
    console.log(`Posted "${jobTitle}" to LinkedIn (attempts: ${attempt})`);
    return { statusCode: 200, body: `Posted to LinkedIn: ${jobTitle}` };
  }

  await deleteMessageFromQueue(receiptHandle);

  if (lastStatus === 401) {
    await sendTelegramMessage(
      TELEGRAM_BOT_TOKEN,
      TELEGRAM_CHAT_ID,
      getPlatformTokenExpiredMessage(
        'LinkedIn',
        'npx tsx scripts/linkedin-oauth-setup.ts',
        '/job-scraper/LINKEDIN_ACCESS_TOKEN'
      )
    );
  } else {
    await sendTelegramMessage(
      TELEGRAM_BOT_TOKEN,
      TELEGRAM_CHAT_ID,
      getPlatformPostFailedMessage('LinkedIn', jobTitle, lastStatus, lastError)
    );
  }

  console.error(`LinkedIn post failed after ${MAX_ATTEMPTS} attempts — message deleted`);
  return { statusCode: 500, body: `LinkedIn failed: ${lastStatus}` };
};
