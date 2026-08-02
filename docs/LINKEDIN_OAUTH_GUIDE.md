# LinkedIn OAuth 2.0 Setup & Auto-Posting Guide

Comprehensive guide for configuring LinkedIn OAuth 2.0 to automate LinkedIn posting for personal profiles (or company pages).

---

## 1. Overview & Architecture

LinkedIn uses **3-Legged OAuth 2.0** to generate an Access Token on behalf of a LinkedIn user.

```
+------------------+         1. Generates Auth URL          +-----------------------+
|  Your MacBook    | -------------------------------------> |  Friend / Account     |
| (Terminal Script)|                                        |     Owner Laptop      |
+------------------+                                        +-----------------------+
         ^                                                              |
         | 4. Pastes full redirected URL                               | 2. Opens Auth URL
         |    or code in terminal                                       |    & clicks "Allow"
         |                                                              v
+-----------------------------------------------------------------------------------+
| 3. LinkedIn redirects browser to: http://localhost:8080/callback?code=AQ...       |
|    (Browser on friend's laptop displays "Site can't be reached" - this is expected)|
+-----------------------------------------------------------------------------------+
         |
         v 5. Exchanges Code for Access Token via LinkedIn OAuth API
+-----------------------------------------------------------------------------------+
| Script outputs:                                                                   |
|   - LINKEDIN_ACCESS_TOKEN                                                         |
|   - LINKEDIN_PERSON_URN (urn:li:person:XXXXX)                                     |
+-----------------------------------------------------------------------------------+
```

---

## 2. LinkedIn Developer Portal Configuration

Before running the setup script, set up your app in the LinkedIn Developer Portal.

### Step 2.1: Create App
1. Go to [LinkedIn Developer Portal](https://www.linkedin.com/developers/).
2. Click **Create app**.
3. Name your app (e.g., `Jobs Automation`) and associate it with a LinkedIn Page.

### Step 2.2: Add Required Products
Go to the **Products** tab of your app and request/add:

1. **Share on LinkedIn** (Default Tier)
   - *Provides scope*: `w_member_social`
   - *Use*: Allows posting directly to personal member feeds.
2. **Sign In with LinkedIn using OpenID Connect** (Standard Tier)
   - *Provides scopes*: `openid`, `profile`, `email`
   - *Use*: Allows identifying the user and obtaining the **Person URN** (`urn:li:person:...`).

> ⚠️ **Note on `w_organization_social`**: Do NOT request or include `w_organization_social` unless you have applied and been approved for the *Community Management API*. For posting to personal profiles, `w_member_social` is all that is required.

### Step 2.3: Configure Redirect URL
Go to the **Auth** tab:
1. Copy **Client ID** and **Client Secret**.
2. Under **OAuth 2.0 redirect URLs**, click **Add redirect URL**.
3. Add: `http://localhost:8080/callback`
4. Click **Save**.

---

## 3. Running the Token Generator Script

### Prerequisites
- Node.js installed on your machine.
- Project dependencies installed (`npm install`).

### Command
From the root of your project, run:
```bash
npx tsx scripts/linkedin-oauth-setup.ts
```

---

## 4. Remote Friend Authorization Workflow

If **you** run the script on your MacBook, but your **friend** owns the LinkedIn account on their laptop:

1. **Start Script**: Run `npx tsx scripts/linkedin-oauth-setup.ts`.
2. **Enter Credentials**: Enter the **Client ID** and **Client Secret** when prompted.
3. **Share Auth URL**: The script will print a URL starting with `https://www.linkedin.com/oauth/v2/authorization?...`. Copy and send this URL to your friend (via Slack, WhatsApp, Email).
4. **Friend Authorizes**: Your friend opens the link, logs into LinkedIn, and clicks **Allow**.
5. **Copy Redirect URL**:
   - LinkedIn redirects your friend's browser to `http://localhost:8080/callback?code=AQ...&state=...`.
   - Their browser will show *"This site can't be reached"* (because the script server is on your Mac, not their laptop). **This is normal!**
   - Ask your friend to copy the **entire URL** from their browser address bar and send it back to you.
6. **Paste in Terminal**:
   - Paste the copied URL into your terminal.
   - The script's `extractCode()` parser automatically extracts the code and strips out parameter noise like `&state=...`.
7. **Done**: The script exchanges the code and prints out the **Access Token** and **Person URN**.

---

## 5. Environment Variables & SSM Storage

Store the output values securely (e.g., in AWS Parameter Store or your `.env` file):

| Parameter Key | Type | Description |
| :--- | :--- | :--- |
| `/job-scraper/LINKEDIN_CLIENT_ID` | `SecureString` | LinkedIn App Client ID |
| `/job-scraper/LINKEDIN_CLIENT_SECRET` | `SecureString` | LinkedIn App Client Secret |
| `/job-scraper/LINKEDIN_ACCESS_TOKEN` | `SecureString` | OAuth 2.0 Bearer Access Token |
| `/job-scraper/LINKEDIN_PERSON_URN` | `String` | Member URN (format: `urn:li:person:<id>`) |

---

## 6. Expiry & Maintenance

- **Access Token Expiry**: LinkedIn 3-legged OAuth access tokens are valid for **60 days**.
- **Refreshing**: LinkedIn does not issue standard offline refresh tokens for personal profile posting. When the token expires (after ~60 days), simply re-run:
  ```bash
  npx tsx scripts/linkedin-oauth-setup.ts
  ```
  and update your stored `LINKEDIN_ACCESS_TOKEN`.

---

## 7. Common Errors & Troubleshooting

### `unauthorized_scope_error: Scope "w_organization_social" is not authorized`
- **Cause**: The app requested `w_organization_social`, which requires the *Community Management API* product.
- **Fix**: Ensure your script requests `w_member_social`, `openid`, `profile`, `email` instead.

### `401 - invalid_request: authorization code not found`
- **Cause**: The pasted code contained trailing strings (e.g. `&state=...`), was already used once, or expired.
- **Fix**: Authorization codes expire in ~30-60 seconds and are single-use. Re-run the script and paste the full redirected URL immediately after authorization.
