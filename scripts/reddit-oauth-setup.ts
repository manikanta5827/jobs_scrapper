/**
 * reddit-oauth-setup.ts
 * One-time script to generate a Reddit OAuth access token using the "script" app type.
 * 
 * Prerequisites:
 * 1. Go to https://www.reddit.com/prefs/apps
 * 2. Click "are you a developer? create an app..."
 * 3. Choose "script" type
 * 4. Set redirect URI to http://localhost:8080/callback (required even for script apps)
 * 5. Note the client_id (string under "personal use script") and secret
 * 
 * Usage:
 *   npx tsx scripts/reddit-oauth-setup.ts
 * 
 * Note: Script-app tokens expire in 1 hour. For production, switch to a "web app"
 * type and use the authorization_code flow with refresh tokens.
 */

import * as readline from 'node:readline';

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans); }));
}

async function main() {
  console.log('\n🔐 Reddit OAuth Token Setup\n');
  console.log('Make sure you have a Reddit "script" app at https://www.reddit.com/prefs/apps\n');

  const clientId = await prompt('Client ID (from "personal use script"): ');
  const clientSecret = await prompt('Client Secret: ');
  const username = await prompt('Reddit Username: ');
  const password = await prompt('Reddit Password: ');

  if (!clientId || !clientSecret || !username || !password) {
    console.error('All fields are required.');
    process.exit(1);
  }

  console.log('\nExchanging credentials for access token...');

  try {
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const res = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${auth}`,
        'User-Agent': 'JobScraperBot/1.0',
      },
      body: new URLSearchParams({
        grant_type: 'password',
        username,
        password,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Token exchange failed: ${res.status} - ${err}`);
    }

    const data = await res.json() as { access_token: string; expires_in: number; scope: string };
    console.log('Raw response:', JSON.stringify(data, null, 2));

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 Token generated successfully!\n');
    console.log('Store these in AWS SSM Parameter Store:\n');
    console.log('  /job-scraper/REDDIT_ACCESS_TOKEN    = ', data.access_token);
    console.log('  /job-scraper/REDDIT_SUBREDDIT       =  jobpostings  (or your choice)\n');
    console.log('⚠️  Token expires in 1 hour. For production, consider automated refresh.');
    console.log('   See: https://github.com/reddit-archive/reddit/wiki/OAuth2');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  } catch (err) {
    console.error('❌ Token exchange failed:', err);
    process.exit(1);
  }
}

main().catch(err => { console.error('Fatal error:', err); process.exit(1); });
