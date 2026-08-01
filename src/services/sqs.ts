import { SQSClient, SendMessageBatchCommand, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import type { EnrichedJob } from '../types';

const sqs = new SQSClient({});
const QUEUE_URL = process.env.POST_QUEUE_URL!;

export type Platform = 'linkedin';

// Clean SQS message payload containing platform, candidate string UUID userId, and job posting details
export interface PostMessage {
  platform: Platform;
  userId: string;
  job: Pick<EnrichedJob, 'title' | 'companyName' | 'link' | 'ai_matched_skills' | 'ai_job_location' | 'ai_yoe' | 'location'>;
}

// Push matched jobs along with candidate string UUID userId to SQS queue
export async function pushToPostQueue(
  platform: Platform, 
  userId: string,
  jobs: EnrichedJob[]
): Promise<void> {
  const entries = jobs.map((job, i) => ({
    Id: `${platform}-job-${i}`,
    MessageBody: JSON.stringify({
      platform,
      userId,
      job: {
        title: job.title,
        companyName: job.companyName,
        link: job.link,
        ai_matched_skills: job.ai_matched_skills,
        ai_job_location: job.ai_job_location,
        ai_yoe: job.ai_yoe,
        location: job.location,
      },
    }),
  }));

  // Send messages in batches of 10 to SQS
  for (let i = 0; i < entries.length; i += 10) {
    const batch = entries.slice(i, i + 10);
    await sqs.send(new SendMessageBatchCommand({ QueueUrl: QUEUE_URL, Entries: batch }));
    console.log(`Pushed batch of ${batch.length} jobs to ${platform} post queue for User ID ${userId}`);
  }
}

// Poll one job message from SQS queue for processing
export async function receiveJobFromQueue(): Promise<{ message: PostMessage; receiptHandle: string } | null> {
  const res = await sqs.send(new ReceiveMessageCommand({
    QueueUrl: QUEUE_URL,
    MaxNumberOfMessages: 1,
    WaitTimeSeconds: 0,
    VisibilityTimeout: 300,
  }));

  if (!res.Messages || res.Messages.length === 0) return null;

  const msg = res.Messages[0];
  const body = JSON.parse(msg.Body!) as PostMessage;
  return { message: body, receiptHandle: msg.ReceiptHandle! };
}

// Delete message from queue after processing
export async function deleteMessageFromQueue(receiptHandle: string): Promise<void> {
  await sqs.send(new DeleteMessageCommand({ QueueUrl: QUEUE_URL, ReceiptHandle: receiptHandle }));
}
