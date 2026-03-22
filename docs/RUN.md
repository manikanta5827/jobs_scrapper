# 🚀 Setup and Running the Job Scraper

This guide will walk you through setting up, testing, and deploying the AI Job Scraper service.

## 📋 Prerequisites

*   **Node.js**: v18 or later.
*   **AWS CLI & SAM CLI**: Installed and configured with your AWS credentials.
*   **Apify API Key**: From your [Apify Console](https://console.apify.com/).
*   **OpenAI API Key**: From your [OpenAI Platform](https://platform.openai.com/).
*   **Neon Postgres**: A serverless Postgres database from [Neon.tech](https://neon.tech/).
*   **AWS SES**: A verified sender email address (MASTER_EMAIL).

## 🛠 Configuration

### 1. Resume Setup
Create a `resume.txt` in the project root containing your latest CV text. The AI uses this to evaluate job relevance.

### 2. Local Environment (`env.json`)
Create an `env.json` in the root directory for local testing:

```json
{
  "MainLambda": {
    "APIFY_API_KEY_PATH": "your_apify_token",
    "OPENAI_API_KEY_PATH": "your_openai_token",
    "DATABASE_URL_PATH": "postgresql://...",
    "MASTER_EMAIL_PATH": "sender@example.com",
    "RECEIVER_EMAIL_PATH": "receiver@example.com"
  }
}
```

### 3. AWS SSM Parameter Store
For deployment, the Lambda fetches secrets at runtime. Ensure these paths exist in your AWS Parameter Store:
*   `/job-scraper/APIFY_API_KEY`
*   `/job-scraper/OPENAI_API_KEY`
*   `/job-scraper/DATABASE_URL`
*   `/job-scraper/MASTER_EMAIL`
*   `/job-scraper/RECEIVER_EMAIL`

---

## 💻 Local Development

### Build and Test
```bash
# Build the project
sam build

# Invoke the function locally
sam local invoke MainLambda --env-vars env.json

# Run TypeScript type checking
npm run typecheck
```

### Database Management
This project uses **Drizzle ORM**.
*   **Schema**: `src/db/schema.ts`
*   **Database Helpers**: `src/helper/db_helper.ts`
*   **Migrations**: Managed under `drizzle/`.

---

## 📦 Deployment

### Deploy to AWS
To deploy the infrastructure (Lambda, EventBridge, IAM roles):

```bash
sam deploy --guided
```

### Daily Trigger
The Lambda is triggered automatically by an EventBridge rule defined in `template.yml` (default: 2:00 AM UTC). You can modify this in the `Events` section of the template.

## 📬 Troubleshooting
*   **SES Error**: Ensure both `MASTER_EMAIL` and `RECEIVER_EMAIL` are verified if your SES account is in Sandbox mode.
*   **DB Connection**: Verify that your Neon database is accessible and the `DATABASE_URL` is correct.
*   **OpenAI Parsing**: If you see parsing errors, ensure your `resume.txt` is not empty and the job description isn't excessively long.
