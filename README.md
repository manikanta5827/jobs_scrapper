# Job Scraper Lambda

Automated job scraping from LinkedIn using Apify, OpenAI for relevance checking, and Neon (Postgres) for storage.

## Local Development

### 1. Setup Environment Variables

Create an `env.json` file in the root directory to provide local values for the environment variables:

```json
{
    "MainLambda": {
        "APIFY_API_KEY": "your_apify_api_key",
        "OPENAI_API_KEY": "your_openai_api_key",
        "DATABASE_URL": "your_neon_postgres_url",
        "RESUME_TEXT": "your_resume_text_content"
    }
}
```

### 2. Invoke Locally

To build and trigger the Lambda function once:

```bash
# Build the project (required after changes)
sam build

# Invoke the function locally
sam local invoke MainLambda --env-vars env.json
```

### 3. Type Checking

To run TypeScript type checks:

```bash
npm run typecheck
```

## Database Management

This project uses Drizzle ORM.

- Schema is defined in `src/db/schema.ts`
- Database helper functions are in `src/helper/db_helper.ts`
