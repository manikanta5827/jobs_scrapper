import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

const ssmClient = new SSMClient({});

/**
 * Fetches a decrypted parameter from AWS SSM.
 */
async function getSecret(path: string | undefined): Promise<string> {
    if (!path) return "";
    
    // If it's not a path (doesn't start with /), it might already be the value (for local testing)
    if (!path.startsWith("/")) return path;

    try {
        const command = new GetParameterCommand({
            Name: path,
            WithDecryption: true,
        });
        const response = await ssmClient.send(command);
        return response.Parameter?.Value ?? "";
    } catch (error) {
        console.error(`Error fetching secret from SSM (${path}):`, error);
        return "";
    }
}

/**
 * Fetches all required secrets and populates process.env.
 * This should be called at the start of the Lambda handler.
 */
export async function loadSecrets(): Promise<void> {
    const secrets = await Promise.all([
        getSecret(process.env.APIFY_API_KEY),
        getSecret(process.env.OPENAI_API_KEY),
        getSecret(process.env.DATABASE_URL),
        getSecret(process.env.MASTER_EMAIL),
        getSecret(process.env.RECEIVER_EMAIL),
    ]);

    process.env.APIFY_API_KEY = secrets[0];
    process.env.OPENAI_API_KEY = secrets[1];
    process.env.DATABASE_URL = secrets[2];
    process.env.MASTER_EMAIL = secrets[3];
    process.env.RECEIVER_EMAIL = secrets[4];
}
