import { SQSClient, SendMessageBatchCommand, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import type { EnrichedJob } from './types';

const sqs = new SQSClient({});
const QUEUE_URL = process.env.POST_QUEUE_URL!;

export type Platform = 'linkedin';

export interface PostMessage {
  platform: Platform;
  job: Pick<EnrichedJob, 'title' | 'companyName' | 'link' | 'ai_matched_skills' | 'ai_job_location' | 'ai_yoe' | 'location'>;
}

export async function pushToPostQueue(platform: Platform, jobs: EnrichedJob[]): Promise<void> {
  const entries = jobs.map((job, i) => ({
    Id: `${platform}-job-${i}`,
    MessageBody: JSON.stringify({
      platform,
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

  for (let i = 0; i < entries.length; i += 10) {
    const batch = entries.slice(i, i + 10);
    await sqs.send(new SendMessageBatchCommand({ QueueUrl: QUEUE_URL, Entries: batch }));
    console.log(`Pushed batch of ${batch.length} jobs to ${platform} post queue`);
  }
}

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

export async function deleteMessageFromQueue(receiptHandle: string): Promise<void> {
  await sqs.send(new DeleteMessageCommand({ QueueUrl: QUEUE_URL, ReceiptHandle: receiptHandle }));
}
