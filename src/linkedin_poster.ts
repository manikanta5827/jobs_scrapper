import type { ScheduledEvent, Context } from 'aws-lambda';
import { getAccessToken } from './helper/linkedin_oauth';
import { postToLinkedIn } from './helper/linkedin_post';
import { formatJobPost } from './helper/linkedin_templates';
import { receiveJobFromQueue, deleteMessageFromQueue } from './helper/sqs_helper';
import { sendTelegramMessage } from './helper/telegram_helper';
import { getLinkedInPostFailedMessage, getLinkedInTokenExpiredMessage } from './helper/telegram_templates';

const PERSON_URN = process.env.LINKEDIN_PERSON_URN!;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_MATCHED_JOBS_BOT_TOKEN!;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_MATCHED_JOBS_CHAT_ID!;

export const handler = async (_event: ScheduledEvent, _context: Context) => {
  console.log('LinkedInPosterLambda invoked', new Date().toISOString());

  const jobMessage = await receiveJobFromQueue();
  if (!jobMessage) {
    console.log('No jobs in queue, exiting');
    return { statusCode: 200, body: 'No jobs' };
  }

  const { message, receiptHandle } = jobMessage;
  const jobTitle = message.job.title || 'Unknown Job';

  try {
    const accessToken = await getAccessToken();
    const postText = formatJobPost(message.job as any);
    const result = await postToLinkedIn(postText, accessToken, PERSON_URN);

    if (result.success) {
      await deleteMessageFromQueue(receiptHandle);
      console.log(`Posted job "${jobTitle}" to LinkedIn — ${result.postUrn}`);
      return { statusCode: 200, body: `Posted: ${jobTitle}` };
    }

    if (result.status === 401) {
      console.error('LinkedIn access token expired or invalid');
      await sendTelegramMessage(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, getLinkedInTokenExpiredMessage());
      return { statusCode: 500, body: 'LinkedIn token expired' };
    }

    console.error(`LinkedIn post failed: ${result.status}`, result.error);
    await sendTelegramMessage(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, getLinkedInPostFailedMessage(jobTitle, result.status, result.error || ''));
    return { statusCode: 500, body: `Failed: ${result.status}` };

  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('LinkedInPosterLambda error:', errorMsg);
    await sendTelegramMessage(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, getLinkedInPostFailedMessage(jobTitle, 0, errorMsg));
    return { statusCode: 500, body: errorMsg };
  }
};
