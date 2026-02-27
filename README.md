# Job Scraper Lambda

Automated job scraping from LinkedIn using Apify, OpenAI for relevance checking, Neon (Postgres) for storage, and AWS SES for email notifications.

## Local Development

### 1. Setup Environment Variables
Create an `env.json` file in the root directory. For local testing, the `_PATH` variables can contain actual values. If the value starts with `/`, the Lambda will attempt to fetch it from AWS SSM (requires AWS credentials).

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

### 2. Invoke Locally
To build and trigger the Lambda function:

```bash
# Build the project
sam build

# Invoke the function locally
sam local invoke MainLambda --env-vars env.json
```

### 3. Type Checking
```bash
npm run typecheck
```

## Database Management
This project uses Drizzle ORM.
- Schema: `src/db/schema.ts`
- Helpers: `src/helper/db_helper.ts`

## AWS Deployment
The Lambda fetches secrets at runtime from AWS SSM Parameter Store using the paths defined in `template.yml`.
- **SSM Paths:** Ensure `/job-scraper/APIFY_API_KEY`, etc., exist in your region.
- **SES:** Ensure the `MASTER_EMAIL` is verified in AWS SES.
