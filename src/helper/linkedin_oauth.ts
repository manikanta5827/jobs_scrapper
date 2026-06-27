import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

const ssm = new SSMClient({});

export async function getAccessToken(): Promise<string> {
  const res = await ssm.send(new GetParameterCommand({
    Name: '/job-scraper/LINKEDIN_ACCESS_TOKEN',
    WithDecryption: true,
  }));
  if (!res.Parameter?.Value) throw new Error('LINKEDIN_ACCESS_TOKEN SSM parameter is empty');
  return res.Parameter.Value;
}


