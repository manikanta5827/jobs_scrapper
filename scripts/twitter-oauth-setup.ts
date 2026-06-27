/**
 * twitter-oauth-setup.ts
 * One-time script to generate Twitter OAuth 2.0 Bearer Token.
 * 
 * Prerequisites:
 * 1. Go to https://developer.x.com/en/portal/dashboard
 * 2. Create a project + app (Free tier works for posting tweets)
 * 3. In your app's "Keys and tokens" section, generate a Bearer Token
 * 4. Set the app's user authentication settings:
 *    - App permissions: Read and write
 *    - Type of App: Web App
 *    - Callback URI: http://localhost:8080/callback
 * 
 * Usage:
 *   npx tsx scripts/twitter-oauth-setup.ts
 */

import * as http from 'node:http';
import * as readline from 'node:readline';
import { exec } from 'node:child_process';

const REDIRECT_URI = 'http://localhost:8080/callback';
const SCOPES = ['tweet.read', 'tweet.write', 'users.read', 'offline.access'];

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans); }));
}

function startCallbackServer(): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || '/', `http://${req.headers.host}`);
      if (url.pathname === '/callback') {
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');
        if (error) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`<h1>Authorization Failed</h1><p>Error: ${error}</p>`);
          server.close();
          reject(new Error(`Twitter OAuth error: ${error}`));
          return;
        }
        if (code) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<h1>Authorization Successful!</h1><p>You can close this window.</p>');
          server.close();
          resolve(code);
          return;
        }
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<h1>Invalid Callback</h1>');
      }
    });
    server.listen(8080, () => console.log('Callback server listening on http://localhost:8080'));
    setTimeout(() => { server.close(); reject(new Error('Timed out (5 minutes)')); }, 5 * 60 * 1000);
  });
}

async function main() {
  console.log('\n🔐 Twitter OAuth Token Setup\n');
  console.log('Make sure you have a Twitter app at https://developer.x.com/en/portal/dashboard\n');

  const clientId = await prompt('Client ID (OAuth 2.0 Client ID): ');
  const clientSecret = await prompt('Client Secret: ');

  if (!clientId || !clientSecret) {
    console.error('Client ID and Client Secret are required.');
    process.exit(1);
  }

  const authUrl = new URL('https://x.com/i/oauth2/authorize');
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('scope', SCOPES.join(' '));
  authUrl.searchParams.set('state', Math.random().toString(36).substring(7));
  authUrl.searchParams.set('code_challenge', 'challenge');
  authUrl.searchParams.set('code_challenge_method', 'plain');

  console.log('\n📋 Opening browser for Twitter authorization...\n');
  console.log(`If the browser doesn't open, visit:\n${authUrl.toString()}\n`);

  exec(`open "${authUrl.toString()}"`);

  console.log('⏳ Waiting for authorization callback...\n');
  const code = await startCallbackServer();

  console.log('✅ Authorization code received. Exchanging for tokens...\n');

  try {
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const res = await fetch('https://api.x.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${auth}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        code_verifier: 'challenge',
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Token exchange failed: ${res.status} - ${err}`);
    }

    const data = await res.json() as { access_token: string; refresh_token?: string; expires_in: number };
    console.log('Raw response:', JSON.stringify(data, null, 2));

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 Token generated successfully!\n');
    console.log('Store these in AWS SSM Parameter Store:\n');
    console.log('  /job-scraper/TWITTER_CLIENT_ID       = ', clientId);
    console.log('  /job-scraper/TWITTER_CLIENT_SECRET   = ', clientSecret);
    console.log('  /job-scraper/TWITTER_ACCESS_TOKEN    = ', data.access_token);
    if (data.refresh_token) {
      console.log('  /job-scraper/TWITTER_REFRESH_TOKEN   = ', data.refresh_token);
    }
    console.log('\nCLIENT_ID, CLIENT_SECRET, and ACCESS_TOKEN should be SecureString.');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  } catch (err) {
    console.error('❌ Token exchange failed:', err);
    process.exit(1);
  }
}

main().catch(err => { console.error('Fatal error:', err); process.exit(1); });
