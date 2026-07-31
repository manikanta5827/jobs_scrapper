# Implementation Plan — Indeed Job Scraper Service

Integrate **Indeed** (`indeed.com` / `in.indeed.com`) as a new data source microservice in the job scraper codebase. 

---

## 📑 Goal & Overview

- **Problem**: Plain HTTP requests (`axios`) to Indeed return HTTP `403 Forbidden` due to Cloudflare Bot Management.
- **Solution**: Build a Puppeteer + `puppeteer-extra-plugin-stealth` browser automation scraper for Indeed, following the existing pattern of `naukri-jobs-scraper`.
- **Capabilities**: Extract job listings, job metadata (position, company, location, salary, date posted), and **full job descriptions** by visiting detail pages (`/viewjob?jk=<jobKey>`).
- **Response Consistency**: Return standard `JobPosting[]` with `source: 'indeed'`, ensuring zero changes required by downstream payload consumers.

---

## 🧪 Empirical Feasibility Findings

Empirical testing confirmed:
1. **Plain `axios`**: Blocked with `403 Forbidden` (Cloudflare Bot Protection).
2. **Puppeteer + Stealth Plugin**: **Bypasses Cloudflare successfully**.
3. **Extraction**:
   - Search results contain `jobKey` (`data-jk`), title, company name, location string, and relative date.
   - Per-job detail page (`https://www.indeed.com/viewjob?jk=<jobKey>`) provides full plain-text job descriptions (`#jobDescriptionText`, typically 1,500 – 3,000 characters).

---

## 📖 Indeed Parameter Schema

Callers invoke the Lambda with `queryStringParameters`. All fields use source-native names:

| Parameter | Type | Required | Allowed Values | Description |
| :--- | :--- | :--- | :--- | :--- |
| `keyword` | `string` | **Yes*** | `Backend Developer`, `Full Stack` | Search query / job title |
| `location` | `string` | **Yes*** | `Remote`, `San Francisco`, `India` | Location name |
| `fromage` | `string \| number` | No | `1` (24h), `3`, `7` (1 week), `14`, `30` | Job freshness in days (`fromage` param on Indeed) |
| `jobType` | `string \| array` | No | `fulltime`, `parttime`, `contract`, `internship`, `temporary` | Employment type |
| `sort` | `string` | No | `relevance`, `date` | Result ordering (`sort=date` on Indeed) |
| `salary` | `string \| number` | No | `50000`, `80000`, `100000` | Minimum salary estimate |
| `limit` | `number` | No | `1` – `100` (default `25`) | Max jobs to retrieve |
| `page` | `number` | No | `0`, `1`, `2`… (default `0`) | Pagination offset (`start=page*10`) |
| `proxyUrl` | `string` | No | `http://user:pass@proxy:port` | Proxy URL for Cloudflare bypass |

*\*At least one of `keyword` or `location` is required.*

---

## 🏛 Proposed Architectural Changes

### `src/` Component Structure

```
src/
├── indeed-types.ts        [NEW] TypeScript interfaces for Indeed query options & validation
├── indeed-validator.ts    [NEW] Input sanitizer & validator for Indeed parameters
├── indeed-scraper.ts      [NEW] Puppeteer + Stealth browser automation scraper
├── lambda-indeed.ts       [NEW] AWS Lambda handler for Indeed microservice
├── indeed-test.ts         [NEW] Dedicated local test script for Indeed
├── types.ts               [MODIFY] Add 'indeed' to JobPosting.source union
└── index.ts               [MODIFY] Export Indeed modules
```

---

### Key Diffs & Implementations

#### 1. [NEW] `src/indeed-types.ts`
Define query options interface:
```typescript
export type IndeedJobTypeOption = 'fulltime' | 'parttime' | 'contract' | 'internship' | 'temporary';
export type IndeedSortOption = 'relevance' | 'date';

export interface IndeedJobQueryOptions {
  keyword?: string;
  location?: string;
  fromage?: number;
  jobType?: IndeedJobTypeOption | IndeedJobTypeOption[];
  sort?: IndeedSortOption;
  salary?: number | string;
  limit?: number;
  page?: number;
  proxyUrl?: string;
}
```

#### 2. [NEW] `src/indeed-validator.ts`
Sanitize & validate inputs cleanly.

#### 3. [NEW] `src/indeed-scraper.ts`
Implement `IndeedJobsQuery` class using `puppeteer-extra` + `puppeteer-extra-plugin-stealth`:
- Launch browser (`@sparticuz/chromium` in Lambda, local Chrome on macOS).
- Navigate to `https://www.indeed.com/jobs?q=...&l=...&fromage=...&jt=...&sort=...`.
- Parse job cards from DOM.
- For each job (up to `limit`), navigate to `/viewjob?jk=<jobKey>` to extract complete `#jobDescriptionText`.
- Return `JobPosting[]` array with `source: 'indeed'`.

#### 4. [NEW] `src/lambda-indeed.ts`
Standard Lambda handler:
```typescript
import { queryIndeedJobs } from './indeed-scraper';
import { validateIndeedJobQueryOptions } from './indeed-validator';
import type { LambdaEvent, LambdaResponse } from './lambda-types';

export const handler = async (event: LambdaEvent): Promise<LambdaResponse> => {
  const queryParams = event.queryStringParameters || {};
  const validation = validateIndeedJobQueryOptions(queryParams);
  if (!validation.valid || !validation.sanitizedOptions) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: validation.error }),
    };
  }

  try {
    const jobs = await queryIndeedJobs(validation.sanitizedOptions);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, count: jobs.length, data: jobs }),
    };
  } catch (error: any) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: error.message || 'Internal Server Error' }),
    };
  }
};
```

#### 5. [MODIFY] `template.yaml`
Add `IndeedScraperFunction` (1024 MB memory, 120s timeout, identical to `NaukriScraperFunction`).

#### 6. [MODIFY] `package.json`
Add `"test:indeed": "node -r ts-node/register src/indeed-test.ts"` and `"sam:local:indeed"`.

#### 7. [MODIFY] `README.md`
Add full Indeed parameter documentation and response matrix column.

---

## 🧪 Verification Plan

### Automated Tests
1. `npm run build` — Verify TypeScript compilation with zero errors.
2. `npm run test:indeed` — Run local Puppeteer test to fetch Indeed jobs and full descriptions.

### Manual Verification
1. Verify job count matches requested `limit`.
2. Confirm `source: 'indeed'` in returned JSON payload.
3. Confirm `details.descriptionText` contains the full multi-paragraph job description.
