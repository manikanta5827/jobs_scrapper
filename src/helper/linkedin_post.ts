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
  const author = personUrn.startsWith('urn:li:person:') ? personUrn : `urn:li:person:${personUrn}`;

  const requestBody = {
    author,
    commentary: text,
    visibility: 'PUBLIC',
    distribution: {
      feedDistribution: 'MAIN_FEED',
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  };

  const res = await fetch(`${LINKEDIN_API_BASE}/posts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'LinkedIn-Version': '202505',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(requestBody),
  });

  if (res.ok) {
    const header = res.headers.get('x-restli-id') || res.headers.get('location') || '';
    return { postUrn: header, success: true, status: res.status };
  }

  const errorBody = await res.text();
  return { postUrn: '', success: false, status: res.status, error: errorBody };
}
