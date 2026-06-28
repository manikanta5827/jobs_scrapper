/**
 * linkedin-oauth-setup.ts
 * One-time script to generate LinkedIn OAuth tokens via Authorization Code Flow
 * and automatically discover your Person URN.
 * 
 * Prerequisites:
 * 1. Create a LinkedIn app at https://www.linkedin.com/developers/
 * 2. Add BOTH products:
 *    - "Share on LinkedIn" (gives w_member_social scope)
 *    - "Sign In with LinkedIn using OpenID Connect" (gives openid, profile, email)
 * 3. In your app's Auth tab, add: http://localhost:8080/callback as redirect URL
 * 
 * Usage:
 *   npx tsx scripts/linkedin-oauth-setup.ts
 */

import * as http from 'node:http';
import * as readline from 'node:readline';
import { exec } from 'node:child_process';

const REDIRECT_URI = 'http://localhost:8080/callback';
const SCOPES = ['w_member_social', 'openid', 'profile'];
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
          reject(new Error(`LinkedIn OAuth error: ${error} - ${url.searchParams.get('error_description') || ''}`));
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
    setTimeout(() => { server.close(); reject(new Error('Timed out waiting (5 minutes)')); }, 5 * 60 * 1000);
  });
}

async function main() {
  console.log('\n🔐 LinkedIn OAuth Token Setup\n');
  console.log('Make sure both products are added to your app:');
  console.log('  1. "Share on LinkedIn"');
  console.log('  2. "Sign In with LinkedIn using OpenID Connect"\n');

  const clientId = await prompt('Client ID: ');
  const clientSecret = await prompt('Client Secret: ');

  if (!clientId || !clientSecret) {
    console.error('Client ID and Client Secret are required.');
    process.exit(1);
  }

  const authUrl = new URL(`${LINKEDIN_OAUTH_BASE}/authorization`);
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

  try {
    // Step 1: Exchange code for access token
    const tokenRes = await fetch(`${LINKEDIN_OAUTH_BASE}/accessToken`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      throw new Error(`Token exchange failed: ${tokenRes.status} - ${err}`);
    }

    const tokenData = await tokenRes.json() as { access_token: string; id_token?: string; expires_in: number; scope: string };
    console.log('Token response:', JSON.stringify({ scope: tokenData.scope, expires_in: tokenData.expires_in }, null, 2));

    const accessToken = tokenData.access_token;

    // Step 2: Fetch Person URN from /v2/userinfo
    console.log('\n🔍 Fetching your Person URN...');
    const userRes = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    let personUrn = '';
    let personName = '';

    if (userRes.ok) {
      const userData = await userRes.json() as { sub: string; name?: string; email?: string };
      personUrn = `urn:li:person:${userData.sub}`;
      personName = userData.name || '';
      console.log('UserInfo response:', JSON.stringify({ sub: userData.sub, name: userData.name }, null, 2));
    } else {
      console.log(`/v2/userinfo returned ${userRes.status} — trying /v2/me instead...`);
      const meRes = await fetch('https://api.linkedin.com/v2/me', {
        headers: { Authorization: `Bearer ${accessToken}`, 'LinkedIn-Version': '202505' },
      });
      if (meRes.ok) {
        const meData = await meRes.json() as { id: string; localizedFirstName?: string; localizedLastName?: string };
        personUrn = `urn:li:person:${meData.id}`;
        personName = `${meData.localizedFirstName || ''} ${meData.localizedLastName || ''}`.trim();
        console.log('Me response:', JSON.stringify(meData, null, 2));
      } else {
        const errText = await meRes.text();
        console.log(`/v2/me failed: ${meRes.status} — ${errText.substring(0, 300)}`);
        console.log('\n⚠️  Could not auto-detect Person URN. Manual steps:');
        console.log('  1. Run: curl -H "Authorization: Bearer <token>" "https://api.linkedin.com/v2/userinfo"');
        console.log('  2. The "sub" field is your Person ID');
        console.log('  3. Person URN = urn:li:person:<sub>');
      }
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 Setup complete!\n');
    console.log('Store these in AWS SSM Parameter Store:\n');
    console.log('  /job-scraper/LINKEDIN_CLIENT_ID       = ', clientId);
    console.log('  /job-scraper/LINKEDIN_CLIENT_SECRET   = ', clientSecret);
    console.log('  /job-scraper/LINKEDIN_ACCESS_TOKEN    = ', accessToken);
    console.log('  /job-scraper/LINKEDIN_PERSON_URN      = ', personUrn || 'urn:li:person:{YOUR_ID}');
    if (personName) console.log(`  (Account: ${personName})`);
    console.log('\nToken expires in ~60 days — re-run this script to refresh.');
    console.log('CLIENT_ID, CLIENT_SECRET, and ACCESS_TOKEN should be SecureString.');
    console.log('PERSON_URN should be String type.');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  } catch (err) {
    console.error('❌ Setup failed:', err);
    process.exit(1);
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
