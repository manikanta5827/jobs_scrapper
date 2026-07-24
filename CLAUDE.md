# CLAUDE.md

Multi-Tenant Automated LinkedIn Job Scraper & AI Evaluator on AWS Lambda. Scrapes via Apify, filters dynamically per candidate, scores with DeepSeek, and notifies via Telegram.

## Architecture Pipeline

Dispatcher Orchestrator (`src/lambda.ts`) → Per-Candidate Workers (`src/user_worker.ts`) → SQS Posting Queue (`src/post_scheduler.ts`).

1. **Dispatcher** — `src/lambda.ts` queries active candidates in `users` table and dispatches `UserWorkerLambda` invocations asynchronously.
2. **Worker** — `src/user_worker.ts` handles scraping, per-candidate job deduplication, candidate-specific keyword filtering, and DeepSeek AI evaluation.
3. **Scrape** — `src/helper/apify.ts` uses a rotated pool of Apify API keys (`key_rotation` table) to scrape candidate-configured search URLs.
4. **Per-Candidate Dedup** — `getExistingJobsData(userId)` checks job link and fingerprint against `jobs` table strictly per candidate (`(user_id, job_link)` unique index).
5. **Keyword Filter** — `keywordFilter(jobs, user.excludeTitleKeywords)` filters title keywords dynamically configured per candidate in their `users` DB row (no hardcoded static arrays).
6. **DeepSeek AI Match** — `deepseek.checkRelevanceBatch` evaluates candidate resume plain text against job descriptions dynamically, scoring match (0-100) and checking experience compatibility.
7. **Telegram Onboarding & Delivery**:
   - Admin creates candidate via Admin Dashboard (`AdminLambda` / `GET /admin.html`).
   - Candidate links their Telegram account by sending `/register <ID>` (e.g. `/register 12`) to the Telegram bot (`src/telegram_webhook.ts`).
   - Matched jobs are sent to candidate's Telegram Chat ID. Technical errors route strictly to Admin Telegram (`process.env.TELEGRAM_MATCHED_JOBS_CHAT_ID`).

## Stack

- Node 24 / TypeScript / ESM, AWS Lambda via SAM.
- Neon Serverless Postgres + Drizzle ORM (`src/db/`).
- DeepSeek API (AI scoring), Apify (Scraping), Telegram Bot API (Alerts & Webhook).

## Commands

```bash
npm run typecheck          # tsc --noEmit
npm run sam:build          # sam validate --lint && sam build --parallel
npm run sam:deploy         # sam deploy --no-confirm-changeset
npm run db:generate        # drizzle-kit generate
npm run db:migrate         # npx tsx scripts/migrate.ts
```
