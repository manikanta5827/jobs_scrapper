import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const sesClient = new SESClient({});

/**
 * Sends an email using AWS SES.
 * @param sender Verified SES email address
 * @param receiver Destination email address
 * @param subject Email subject
 * @param body HTML body content
 */
export async function sendEmail(sender: string, receiver: string, subject: string, body: string): Promise<void> {
    console.log(`Sending email from ${sender} to ${receiver}`);
    
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

    try {
        const result = await sesClient.send(new SendEmailCommand(params));
        console.log(`Email sent successfully: ${result.MessageId}`);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown SES error";
        console.error(`Error sending email: ${errorMessage}`);
        // We don't necessarily want to crash the whole Lambda if email fails
    }
}
