/**
 * linkedin-oauth-setup.ts
 * One-time script to generate LinkedIn OAuth tokens via the Authorization Code Flow.
 * 
 * Prerequisites:
 * 1. Create a LinkedIn app at https://www.linkedin.com/developers/
 * 2. Add "Share on LinkedIn" product to your app (must be the "Share on LinkedIn" product,
 *    not "Sign In with LinkedIn") — this gives you the w_member_social scope
 * 3. Note your Client ID and Client Secret
 * 4. In your app's Auth tab, under OAuth 2.0 Settings, add:
 *    http://localhost:8080/callback as an authorized redirect URL
 * 
 * Usage:
 *   npx tsx scripts/linkedin-oauth-setup.ts
 * 
 * This will:
 * 1. Prompt you for Client ID and Client Secret
 * 2. Open a browser to LinkedIn's authorization page
 * 3. Wait for you to paste the authorization code
 * 4. Exchange the code for access_token + refresh_token
 * 5. Print the tokens for SSM storage
 */

import * as http from 'node:http';
import * as readline from 'node:readline';
import { exec } from 'node:child_process';

const REDIRECT_URI = 'http://localhost:8080/callback';
const SCOPES = ['w_member_social'];
const LINKEDIN_OAUTH_BASE = 'https://www.linkedin.com/oauth/v2';


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
          res.end(`<h1>Authorization Failed</h1><p>Error: ${error}</p><p>${url.searchParams.get('error_description') || ''}</p>`);
          server.close();
          reject(new Error(`LinkedIn OAuth error: ${error}`));
          return;
        }

        if (code) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<h1>Authorization Successful!</h1><p>You can close this window and return to the terminal.</p>');
          server.close();
          resolve(code);
          return;
        }

        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<h1>Invalid Callback</h1><p>No authorization code received.</p>');
      }
    });

    server.listen(8080, () => console.log('Callback server listening on http://localhost:8080'));
    setTimeout(() => {
      server.close();
      reject(new Error('Timed out waiting for authorization code (5 minutes)'));
    }, 5 * 60 * 1000);
  });
}

async function main() {
  console.log('\n🔐 LinkedIn OAuth Token Setup\n');
  console.log('Make sure you have a LinkedIn app created at https://www.linkedin.com/developers/\n');

  const clientId = await prompt('Client ID: ');
  const clientSecret = await prompt('Client Secret: ');

  if (!clientId || !clientSecret) {
    console.error('Client ID and Client Secret are required.');
    process.exit(1);
  }

  const authUrl = new URL('https://www.linkedin.com/oauth/v2/authorization');
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('scope', SCOPES.join(' '));
  authUrl.searchParams.set('state', Math.random().toString(36).substring(7));

  console.log('\n📋 Opening browser for LinkedIn authorization...\n');
  console.log(`If the browser doesn't open, visit:\n${authUrl.toString()}\n`);

  exec(`open "${authUrl.toString()}"`);

  console.log('⏳ Waiting for authorization callback...\n');
  const code = await startCallbackServer();

  console.log('✅ Authorization code received. Exchanging for tokens...\n');

  const debugMode = true;

  try {
    const accessToken = await exchangeAuthCode(code, REDIRECT_URI, clientId, clientSecret, debugMode);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 Token generated successfully!\n');
    console.log('Store these in AWS SSM Parameter Store:\n');
    console.log('  /job-scraper/LINKEDIN_CLIENT_ID       = ', clientId);
    console.log('  /job-scraper/LINKEDIN_CLIENT_SECRET   = ', clientSecret);
    console.log('  /job-scraper/LINKEDIN_ACCESS_TOKEN    = ', accessToken);
    console.log('  /job-scraper/LINKEDIN_PERSON_URN      =  urn:li:person:{YOUR_ID}\n');
    console.log('To find your Person URN:');
    console.log('  Go to your LinkedIn profile, view page source (Cmd+Option+U),');
    console.log('  search for "urn:li:person:" and copy the full URN.\n');
    console.log('Token expires in ~60 days — re-run this script to get a new one.');
    console.log('CLIENT_ID, CLIENT_SECRET, and ACCESS_TOKEN should be stored as SecureString type.');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  } catch (err) {
    console.error('❌ Token exchange failed:', err);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

export async function exchangeAuthCode(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
  debug = false
): Promise<string> {
  const res = await fetch(`${LINKEDIN_OAUTH_BASE}/accessToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LinkedIn token exchange failed: ${res.status} - ${err}`);
  }

  const data = await res.json() as { access_token: string; expires_in: number; scope: string };
  if (debug) console.log('LinkedIn raw token response:', JSON.stringify(data, null, 2));
  return data.access_token;
}
