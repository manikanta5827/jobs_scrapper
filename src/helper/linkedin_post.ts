const LINKEDIN_API_BASE = 'https://api.linkedin.com/v2';

export interface LinkedInPostResult {
  postUrn: string;
  success: boolean;
  status: number;
  error?: string;
}

export async function postToLinkedIn(
  text: string,
  accessToken: string,
  personUrn: string
): Promise<LinkedInPostResult> {
  const author = personUrn.startsWith('urn:li:') ? personUrn : `urn:li:person:${personUrn}`;

  const body = {
    author,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text },
        shareMediaCategory: 'NONE',
      },
    },
    visibility: {
      'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
    },
  };

  const res = await fetch(`${LINKEDIN_API_BASE}/ugcPosts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'LinkedIn-Version': '202505',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(body),
  });

  if (res.ok) {
    const header = res.headers.get('x-restli-id') || res.headers.get('location') || '';
    return { postUrn: header, success: true, status: res.status };
  }

  const errorBody = await res.text();
  return { postUrn: '', success: false, status: res.status, error: errorBody };
}
