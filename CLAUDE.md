# CLAUDE.md

Multi-Tenant Automated Multi-Platform Job Scraper & AI Evaluator on AWS Lambda. Scrapes via Apify (LinkedIn, Naukri, SimplyHired, Indeed), filters dynamically per candidate, scores via OpenRouter LLM, and notifies via Telegram & LinkedIn.

## Architecture Pipeline

`ScraperDispatcherLambda` (`src/scraper_dispatcher.ts`) → S3 Bucket (`RawJobsBucket`) → `EvaluatorDispatcherLambda` (`src/evaluator_dispatcher.ts`) → `EvaluatorLambda` (`src/evaluator.ts`) → SQS Posting Queue (`src/post_scheduler.ts`) → Telegram / LinkedIn Delivery.

1. **Scraper Dispatcher** — `src/scraper_dispatcher.ts` (triggered 3x daily: 11:00, 16:00, 20:00 IST) queries active candidate search profiles, triggers scrapers via Apify key rotation (`key_rotation` table), and stores raw job payloads in S3 (`raw-jobs/` prefix with 7-day retention).
2. **Evaluator Dispatcher** — `src/evaluator_dispatcher.ts` (triggered 30 mins after scrapers: 11:30, 16:30, 20:30 IST) finds active candidates and dispatches `EvaluatorLambda` invocations asynchronously.
3. **Per-User Evaluator** — `src/evaluator.ts` processes candidate jobs:
   - **Per-Candidate Dedup**: `getExistingJobsData(userId)` checks link and fingerprint against `jobs` table strictly per candidate (`(user_id, job_link)` unique index).
   - **Title Keyword Filter**: `keywordFilter(jobs, user.excludeTitleKeywords)` filters title keywords dynamically configured in candidate's `users` row.
   - **LLM AI Match**: `checkRelevanceBatch` (`src/services/llm.ts`) extracts structured job facts (`required_skills`, `min/max_yoe`, `domain`, etc.) using OpenRouter AI SDK. `fit_evaluator.ts` applies deterministic business rules (`strong_match`, `minor_gaps`, `experience_mismatch`, `skills_mismatch`, `no_match`). Extracted facts are stored in `jobs.ai_facts` JSONB.
   - **PostHog Observability**: `src/services/telemetry.ts` logs evaluation metrics to PostHog (`@posthog/ai`).
   - **Queue Matched Jobs**: Relevant jobs (`strong_match`, `minor_gaps`) are enqueued into SQS `PostQueue`.
4. **Post Scheduler Queue Consumer** — `src/post_scheduler.ts` consumes SQS `PostQueue` messages with concurrency limit = 1 (rate limiting):
   - Sends notification cards to candidate Telegram chats (`src/services/telegram.ts`).
   - Posts updates to candidate LinkedIn profiles (`src/services/linkedin.ts`).
5. **Admin Dashboard API** — `src/admin.ts` provides REST endpoints for candidate CRUD, manual trigger runs, and statistics backend for `public/admin.html`.
6. **Telegram Webhook & Onboarding** — `src/telegram_webhook.ts` handles Telegram bot commands (`/start`, `/stop`, `/register`, `/balance`). Candidates link accounts via `/register <ID>`.

## Stack

- Node 24 / TypeScript / ESM, AWS Lambda via SAM (arm64, esbuild).
- Neon Serverless Postgres + Drizzle ORM (`src/db/`).
- Storage & Messaging: AWS S3 (`RawJobsBucket`), AWS SQS (`PostQueue`).
- AI & Observability: OpenRouter AI SDK (`@openrouter/ai-sdk-provider`, `ai`), PostHog AI (`@posthog/ai`).
- Integrations: Apify (multi-platform job scraping), Telegram Bot API, LinkedIn API.

## Commands

```bash
npm run typecheck          # tsc --noEmit
npm run sam:build          # sam validate --lint && sam build --parallel
npm run sam:deploy         # npm run sam:build && sam deploy --no-confirm-changeset
npm run sam:sync           # sam sync --watch --config-env prod --stack-name job-scrapper
npm run db:generate        # npx drizzle-kit generate
npm run db:migrate         # npx tsx scripts/migrate.ts
npm run lambda             # sam local invoke ScraperDispatcherLambda --env-vars env.json -e event.json
```
