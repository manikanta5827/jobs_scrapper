const REDDIT_API_BASE = 'https://oauth.reddit.com';

export interface RedditPostResult {
  postId: string;
  success: boolean;
  status: number;
  error?: string;
}

export async function postToReddit(
  title: string,
  text: string,
  subreddit: string,
  accessToken: string
): Promise<RedditPostResult> {
  const res = await fetch(`${REDDIT_API_BASE}/api/submit`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'JobScraperBot/1.0',
    },
    body: new URLSearchParams({
      sr: subreddit,
      kind: 'self',
      title,
      text,
    }),
  });

  const body = await res.json() as {
    success: boolean;
    json?: { errors?: unknown[]; data?: { id: string; name: string } };
  };

  if (res.ok && !body.json?.errors?.length) {
    return { postId: body.json?.data?.name || '', success: true, status: res.status };
  }

  const errDetail = JSON.stringify(body.json?.errors || body);
  return { postId: '', success: false, status: res.status, error: errDetail };
}
