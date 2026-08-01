const LINKEDIN_API_BASE = 'https://api.linkedin.com/v2';

export interface LinkedInPostResult {
  postUrn: string;
  success: boolean;
  status: number;
  error?: string;
}

interface RegisterUploadResponse {
  value: {
    uploadMechanism: {
      'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest': {
        uploadUrl: string;
        headers: Record<string, string>;
      };
    };
    asset: string;
  };
}

async function registerImageUpload(
  accessToken: string,
  personUrn: string
): Promise<{ uploadUrl: string; asset: string }> {
  const owner = personUrn.startsWith('urn:li:') ? personUrn : `urn:li:person:${personUrn}`;

  const body = {
    registerUploadRequest: {
      recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
      owner,
      serviceRelationships: [
        { relationshipType: 'OWNER', identifier: 'urn:li:userGeneratedContent' },
      ],
    },
  };

  const res = await fetch(`${LINKEDIN_API_BASE}/assets?action=registerUpload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'LinkedIn-Version': '202505',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LinkedIn image register failed: ${res.status} - ${err}`);
  }

  const data = await res.json() as RegisterUploadResponse;
  return {
    uploadUrl: data.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl,
    asset: data.value.asset,
  };
}

async function uploadImage(uploadUrl: string, imageBuffer: Buffer): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/png' },
    body: imageBuffer,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LinkedIn image upload failed: ${res.status} - ${err}`);
  }
}

export async function postToLinkedIn(
  text: string,
  accessToken: string,
  personUrn: string,
  imageBuffer?: Buffer
): Promise<LinkedInPostResult> {
  const author = personUrn.startsWith('urn:li:') ? personUrn : `urn:li:person:${personUrn}`;

  let shareMediaCategory: string;
  let media: Array<{ status: string; media: string }> | undefined;

  if (imageBuffer) {
    const { uploadUrl, asset } = await registerImageUpload(accessToken, personUrn);
    await uploadImage(uploadUrl, imageBuffer);
    shareMediaCategory = 'IMAGE';
    media = [{ status: 'READY', media: asset }];
  } else {
    shareMediaCategory = 'NONE';
  }

  const body = {
    author,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text },
        shareMediaCategory,
        ...(media ? { media } : {}),
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
