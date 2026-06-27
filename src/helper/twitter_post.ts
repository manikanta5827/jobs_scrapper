const TWITTER_API_BASE = 'https://api.x.com/2';

export interface TwitterPostResult {
  tweetId: string;
  success: boolean;
  status: number;
  error?: string;
}

export async function postToTwitter(text: string, accessToken: string): Promise<TwitterPostResult> {
  const res = await fetch(`${TWITTER_API_BASE}/tweets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ text }),
  });

  if (res.ok) {
    const data = await res.json() as { data: { id: string } };
    return { tweetId: data.data.id, success: true, status: res.status };
  }

  const errorBody = await res.text();
  return { tweetId: '', success: false, status: res.status, error: errorBody };
}
