/**
 * test-linkedin-post.ts — manual test using /v2/ugcPosts (personal profiles)
 * Usage: npx tsx scripts/test-linkedin-post.ts
 */

import * as readline from 'node:readline';

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans); }));
}

async function main() {
  console.log('🔐 LinkedIn Post Test (ugcPosts)\n');

  const accessToken = await prompt('LinkedIn Access Token: ');
  const personUrn = await prompt('Person URN (e.g. urn:li:person:mwlXjv-C2o): ');

  const body = {
    author: personUrn.startsWith('urn:li:') ? personUrn : `urn:li:person:${personUrn}`,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text: '#hiring #sde #freshers #jobs\n\nTest Company is hiring Software Engineer\n📍 Location: Remote, India\n⏳ Experience: 0-2 years\n\nRequirements:\n- Node.js\n- TypeScript\n- AWS\n\nApply link: https://example.com\n\n#career #jobupdates #tech #job #opportunity' },
        shareMediaCategory: 'NONE',
      },
    },
    visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
  };

  console.log('\n📤 Posting...');
  const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'LinkedIn-Version': '202505',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(body),
  });

  console.log(`Status: ${res.status}`);
  const resBody = await res.text();
  console.log('Body:', resBody);

  if (res.ok) {
    console.log(`\n✅ Posted! URN: ${res.headers.get('x-restli-id') || ''}`);
  } else if (res.status === 401) {
    console.log('\n❌ Token expired. Re-run setup script.');
  } else if (res.status === 400 || res.status === 403) {
    console.log('\n❌ Check the URN is correct:', personUrn);
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
