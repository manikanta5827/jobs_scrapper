# CLAUDE.md

Daily LinkedIn job scraper on AWS Lambda. Scrapes via Apify, filters, scores with DeepSeek, pushes matches to Telegram.

> README.md is stale — it says OpenAI/GPT-4o-mini + AWS SES email. The code uses **DeepSeek** (`deepseek-chat`) + **Telegram**. Trust the code.

## Pipeline (`src/lambda.ts` handler)

Scrape → dedup batch → DB dedup → keyword filter → DeepSeek AI match → persist + Telegram notify → cost summary.

1. **Scrape** — `helper/apify.ts`, LinkedIn search URLs from `helper/filter.ts` (`SEARCH_URLS`, lookback injected via `f_TPR`).
2. **Dedup** — `getUniqueJobsFromBatch` (within batch), then `getExistingJobsData` checks `link` + `fingerprint` against Postgres.
3. **Keyword filter** — `keywordFilter` drops by `EXCLUDE_*` lists + `EXCLUDE_TITLE_PATTERNS` (level codes SDE2/L3/II).
4. **AI** — `deepseek.checkRelevanceBatch`, batch size 10, 3s delay. `MIN_MATCH_SCORE` default 60. Resume + rules form a >1024-token static prefix for DeepSeek context caching.
5. **Notify** — `helper/telegram_helper.ts` + `telegram_templates.ts`. Matched + cost summary to one chat; dropped-jobs path exists but is commented out.

## Stack

- Node 24 / TypeScript / ESM, AWS Lambda via SAM.
- Neon serverless Postgres + Drizzle ORM (`src/db/`).
- DeepSeek API (scoring), Apify (scrape), Telegram Bot API (delivery).
- `resume.txt` is imported as a string at build time (`import resumeText from "../../resume.txt"`, esbuild text loader). It must exist to build.

## Infra (`template.yml`)

- **MainLambda** (`src/lambda.handler`) — 4 EventBridge ScheduleV2 crons (Asia/Kolkata): weekdays 09:00/13:00/18:00, Sun 08:00.
- **AdminLambda** (`src/admin.handler`) — API Gateway. `POST /run` invokes MainLambda async with `{ lookbackHours }`.
- Secrets via SSM Parameter Store params (`Type: AWS::SSM::Parameter::Value<String>`), injected as env vars.

## Auth

- MainLambda: event must carry `adminApiKey === process.env.ADMIN_API_KEY`. Unauthorized → 401, no work done.
- AdminLambda: `x-api-key` header must equal `ADMIN_API_KEY`.

## DB schema (`src/db/schema.ts`)

- `jobs` — `job_link` PK, `fingerprint` unique, `seen_at`. Dedup ledger.
- `key_rotation` — Apify API tokens with `usage_cost`, `subscription_start_date`. `resetHighUsageTokens()` clears usage on expired subscriptions each run; `getValidApifyToken()` rotates.

## Commands

```bash
npm run typecheck          # tsc --noEmit
npm run sam:build          # sam validate --lint && sam build --parallel
npm run sam:deploy         # sam deploy --no-confirm-changeset
npm run lambda             # local invoke MainLambda (env.json + event.json)
npm run db:generate        # drizzle-kit generate
npm run db:migrate         # drizzle-kit migrate
```

Local invoke needs `env.json` (secrets) + `event.json` (must include valid `adminApiKey`). See `docs/RUN.md`.

## Gotchas

- DeepSeek `deepseek-chat` alias + pricing constants in `deepseek.ts` have a noted deprecation date (2026-07-24) — re-check before then.
- Filter lists in `filter.ts` are aggressive (exclude Java/React/Frontend/Senior/big-tech companies, etc.) — tuned for one fresher/junior backend profile. Editing them changes what surfaces.
- `event.adminApiKey` is required even for scheduled invokes — the EventBridge targets pass it.
