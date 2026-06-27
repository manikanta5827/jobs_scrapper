import type { ScheduledEvent, Context } from 'aws-lambda';
import { receiveJobFromQueue, deleteMessageFromQueue } from './helper/sqs_helper';
import { sendTelegramMessage } from './helper/telegram_helper';
import { getPlatformPostFailedMessage, getPlatformTokenExpiredMessage } from './helper/telegram_templates';

// ─── LinkedIn ─────────────────────────────────────────────────────────────────
import { postToLinkedIn } from './helper/linkedin_post';
import { formatJobPost } from './helper/linkedin_templates';

// ─── Twitter ─────────────────────────────────────────────────────────────────
import { postToTwitter } from './helper/twitter_post';
import { formatTwitterPost } from './helper/twitter_templates';

// ─── Reddit ──────────────────────────────────────────────────────────────────
// disabled until Reddit app creation bug is fixed
// import { postToReddit } from './helper/reddit_post';
// import { formatRedditPost } from './helper/reddit_templates';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_MATCHED_JOBS_BOT_TOKEN!;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_MATCHED_JOBS_CHAT_ID!;

const RETRY_DELAYS_MS = [30_000, 60_000, 120_000]; // 30s, 1m, 2m gaps between retries
const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1; // 4 total: initial + 3 retries

export const handler = async (_event: ScheduledEvent, _context: Context) => {
  console.log('PostSchedulerLambda invoked', new Date().toISOString());

  const jobMsg = await receiveJobFromQueue();
  if (!jobMsg) {
    console.log('No jobs in queue, exiting');
    return { statusCode: 200, body: 'No jobs' };
  }

  const { message, receiptHandle } = jobMsg;
  const { platform, job } = message;
  const jobTitle = job.title || 'Unknown Job';

  // ── Post with retries ────────────────────────────────────────────────────
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
      switch (platform) {
        case 'linkedin': {
          const token = process.env.LINKEDIN_ACCESS_TOKEN;
          if (!token) throw new Error('LINKEDIN_ACCESS_TOKEN is not set');
          const personUrn = process.env.LINKEDIN_PERSON_URN!;
          const result = await postToLinkedIn(formatJobPost(job as any), token, personUrn);
          success = result.success;
          lastStatus = result.status;
          lastError = result.error || '';
          break;
        }

        case 'twitter': {
          const token = process.env.TWITTER_ACCESS_TOKEN;
          if (!token) throw new Error('TWITTER_ACCESS_TOKEN is not set');
          const result = await postToTwitter(formatTwitterPost(job as any), token);
          success = result.success;
          lastStatus = result.status;
          lastError = result.error || '';
          break;
        }

        case 'reddit': {
          // disabled until Reddit app creation bug is fixed
          // https://www.reddit.com/r/redditdev/comments/1mnu3hw/
          console.warn(`Reddit posting is disabled — skipping "${jobTitle}"`);
          success = true;
          break;
        }

        default:
          console.error(`Unknown platform: ${platform}`);
          await deleteMessageFromQueue(receiptHandle);
          return { statusCode: 400, body: `Unknown platform: ${platform}` };
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      lastStatus = 0;
      console.error(`Attempt ${attempt} error (${platform}):`, lastError);
    }

    if (!success) {
      console.log(`Attempt ${attempt}/${MAX_ATTEMPTS} failed — status: ${lastStatus}`);
    }
  }

  // ── Result ───────────────────────────────────────────────────────────────
  if (success) {
    await deleteMessageFromQueue(receiptHandle);
    console.log(`Posted "${jobTitle}" to ${platform} (attempts: ${attempt})`);
    return { statusCode: 200, body: `Posted to ${platform}: ${jobTitle}` };
  }

  // All attempts failed — delete message so it doesn't stick around and alert
  await deleteMessageFromQueue(receiptHandle);

  if (lastStatus === 401) {
    const setupCmd = platform === 'linkedin' ? 'npx tsx scripts/linkedin-oauth-setup.ts' : 'npx tsx scripts/twitter-oauth-setup.ts';
    const ssmParam = platform === 'linkedin' ? '/job-scraper/LINKEDIN_ACCESS_TOKEN' : '/job-scraper/TWITTER_ACCESS_TOKEN';
    await sendTelegramMessage(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, getPlatformTokenExpiredMessage(platform === 'linkedin' ? 'LinkedIn' : 'Twitter', setupCmd, ssmParam));
  } else {
    await sendTelegramMessage(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, getPlatformPostFailedMessage(platform.toUpperCase(), jobTitle, lastStatus, lastError));
  }

  console.error(`${platform} post failed after ${MAX_ATTEMPTS} attempts — message deleted`);
  return { statusCode: 500, body: `${platform} failed: ${lastStatus}` };
};
