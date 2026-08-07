import type { CloudWatchLogsDecodedData, CloudWatchLogsEvent } from 'aws-lambda';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import * as zlib from 'node:zlib';

const sns = new SNSClient({});
const TOPIC_ARN = process.env.SNS_TOPIC_ARN!;

export const handler = async (event: CloudWatchLogsEvent): Promise<void> => {
  const payload = Buffer.from(event.awslogs.data, 'base64');
  const decompressed = zlib.gunzipSync(payload);
  const data: CloudWatchLogsDecodedData = JSON.parse(decompressed.toString());

  const messages = data.logEvents.map((logEvent) => {
    const ts = new Date(logEvent.timestamp).toISOString();
    let body = logEvent.message;

    try {
      const parsed = JSON.parse(logEvent.message);
      if (parsed.message) {
        body = parsed.message;
      }
    } catch {}

    return `[${data.logGroup}]\n${ts}\n${body}`;
  });

  const message = messages.join('\n---\n');

  await sns.send(new PublishCommand({
    TopicArn: TOPIC_ARN,
    Subject: `[ERROR] ${data.logGroup}`,
    Message: message,
  }));
};
