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

  console.log(`Processing ${platform} post for "${jobTitle}"`);

  try {
    let success = false;
    let postId = '';
    let status = 0;

    switch (platform) {
      case 'linkedin': {
        const token = process.env.LINKEDIN_ACCESS_TOKEN;
        if (!token) throw new Error('LINKEDIN_ACCESS_TOKEN is not set');
        const personUrn = process.env.LINKEDIN_PERSON_URN!;
        const result = await postToLinkedIn(formatJobPost(job as any), token, personUrn);
        success = result.success;
        postId = result.postUrn;
        status = result.status;

        if (!success && status === 401) {
          await sendTelegramMessage(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, getPlatformTokenExpiredMessage('LinkedIn', 'npx tsx scripts/linkedin-oauth-setup.ts', '/job-scraper/LINKEDIN_ACCESS_TOKEN'));
        }
        if (!success && status !== 401) {
          await sendTelegramMessage(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, getPlatformPostFailedMessage('LINKEDIN', jobTitle, status, result.error || ''));
        }
        break;
      }

      case 'twitter': {
        const token = process.env.TWITTER_ACCESS_TOKEN;
        if (!token) throw new Error('TWITTER_ACCESS_TOKEN is not set');
        const result = await postToTwitter(formatTwitterPost(job as any), token);
        success = result.success;
        postId = result.tweetId;
        status = result.status;

        if (!success && status === 401) {
          await sendTelegramMessage(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, getPlatformTokenExpiredMessage('Twitter', 'npx tsx scripts/twitter-oauth-setup.ts', '/job-scraper/TWITTER_ACCESS_TOKEN'));
        }
        if (!success && status !== 401) {
          await sendTelegramMessage(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, getPlatformPostFailedMessage('TWITTER', jobTitle, status, result.error || ''));
        }
        break;
      }

      case 'reddit': {
        // disabled until Reddit app creation bug is fixed
        // https://www.reddit.com/r/redditdev/comments/1mnu3hw/
        console.warn(`Reddit posting is disabled — skipping "${jobTitle}"`);
        success = true; // treat as success so message is deleted from queue
        postId = 'disabled';
        break;
      }

      default:
        console.error(`Unknown platform: ${platform}`);
        return { statusCode: 400, body: `Unknown platform: ${platform}` };
    }

    if (success) {
      await deleteMessageFromQueue(receiptHandle);
      console.log(`Posted "${jobTitle}" to ${platform} — ${postId}`);
      return { statusCode: 200, body: `Posted to ${platform}: ${jobTitle}` };
    }

    console.error(`${platform} post failed: ${status}`);
    return { statusCode: 500, body: `${platform} failed: ${status}` };

  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`PostSchedulerLambda error (${platform}):`, errorMsg);
    await sendTelegramMessage(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, getPlatformPostFailedMessage(platform.toUpperCase(), jobTitle, 0, errorMsg));
    return { statusCode: 500, body: errorMsg };
  }
};
