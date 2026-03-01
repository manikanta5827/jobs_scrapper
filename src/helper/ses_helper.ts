import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const sesClient = new SESClient({});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sends an email using AWS SES with a retry mechanism.
 * @param sender Verified SES email address
 * @param receiver Destination email address
 * @param subject Email subject
 * @param body HTML body content
 */
export async function sendEmail(sender: string, receiver: string, subject: string, body: string): Promise<void> {
    const MAX_ATTEMPTS = 3;
    let attempt = 1;

    const params = {
        Source: sender,
        Destination: {
            ToAddresses: [receiver],
        },
        Message: {
            Subject: {
                Data: subject,
            },
            Body: {
                Html: {
                    Data: body,
                },
            },
        },
    };

    while (attempt <= MAX_ATTEMPTS) {
        try {
            console.log(`Sending email from ${sender} to ${receiver} (Attempt ${attempt}/${MAX_ATTEMPTS})`);
            const result = await sesClient.send(new SendEmailCommand(params));
            console.log(`Email sent successfully: ${result.MessageId}`);
            return;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown SES error";
            console.error(`Attempt ${attempt} failed: ${errorMessage}`);

            if (attempt === MAX_ATTEMPTS) {
                console.error("Max retries reached. Email sending failed.");
                break;
            }

            // Logarithmic-style backoff: 1s, 2s, 4s...
            const delay = Math.pow(2, attempt - 1) * 1000;
            console.log(`Retrying in ${delay}ms...`);
            await sleep(delay);
            attempt++;
        }
    }
}
