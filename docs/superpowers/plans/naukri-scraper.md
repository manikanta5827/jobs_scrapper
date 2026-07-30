# Naukri Jobs Scraper — Add to existing LinkedIn Scraper

## Summary

Add a Naukri.com job scraper alongside the existing LinkedIn scraper, sharing the same codebase, TypeScript types, validator patterns, and Lambda infrastructure. Naukri uses a public internal JSON API (`/jobapi/v3/search`) that works without login — similar architecture to LinkedIn's guest API, but returns structured JSON instead of HTML.

## Key Finding: Naukri's Internal API

Found via open-source Python scrapers. The endpoint:

```
GET https://www.naukri.com/jobapi/v3/search?noOfResults=20&urlType=search_by_keyword&searchType=adv&keyword={encoded}&sort=r&pageNo={page}&k={encoded}&seoKey={slug}-jobs&src=jobsearchDesk&latLong=
```

**Response shape** (from `data.jobDetails[]`):
| Field | Description |
|---|---|
| `jobId` | Unique Naukri job ID |
| `title` | Job title |
| `companyName` | Company name |
| `clientLogo` | Company logo URL |
| `placeholders[].label` | Location/salary (filter by `type`) |
| `footerPlaceholderLabel` | Posted date text |
| `experienceText` | e.g. "0-3 Yrs" |
| `jdURL` | Relative detail page path |
| `tagsAndSkills` | Skills string |
| `jobDescription` | **Short** description (not full HTML) |
| `createdDate` | Unix timestamp |

**Required headers:**
```
appid: 109
clientid: d3skt0p
systemid: Naukri
gid: LOCATION,INDUSTRY,EDUCATION,FAREA_ROLE
content-type: application/json
Referer: naukri.com/{keyword}-jobs?k={keyword}
```

## What We Can Fetch

### Layer 1: Search results (works today, no browser needed)
- Job title, company, location, salary range, experience, skills, short description, logo, URL
- Same `axios` + no Cheerio needed — just parse JSON response

### Layer 2: Full job descriptions (needs investigation)
Naukri detail pages (`/job-listings-...`) are Next.js with JS rendering — Cheerio can't parse them. The search API gives only short descriptions. For full HTML descriptions we need to:
- **Preferred**: sniff the internal detail API endpoint using the agent-browser (Chrome automation)
- **Fallback**: accept short descriptions only and skip full detail enrichment
- **Fallback 2**: use Puppeteer/Playwright to render detail pages (heavier, needs Lambda memory bump to 512MB+)

## Files to Create/Modify

### New files

1. **`src/naukri-scraper.ts`** — Core Naukri scraper class
   - `NaukriJobsQuery` class (mirrors `LinkedInJobsQuery` pattern)
   - `buildUrl(keyword, pageNo)` — construct the search API URL
   - `fetchBatch()` — axios GET to `/jobapi/v3/search`, parse JSON
   - `parseResults(json)` — extract `JobPosting[]` from API response
   - `fetchJobDetails(jobId)` — **Phase 2**, if we find a detail API endpoint
   - `getJobs()` orchestrator — batch loop with rate limiting

2. **`src/naukri-types.ts`** — Naukri-specific types
   - `NaukriJobQueryOptions` (keyword, location, experience, sort, limit, page, jobAge)
   - `NaukriApiResponse` interface matching the JSON shape
   - `NaukriJobDetail` for detail fetch response (when ready)

3. **`src/naukri-validator.ts`** — Input validation
   - `validateNaukriJobQueryOptions(rawInput)` → `{ valid, error?, sanitizedOptions? }`
   - Validate keyword (required), experience, location, jobAge, limit, sort, page

### Modified files

4. **`src/types.ts`** — Add `source` field to `JobQueryOptions` or create a discriminated union
   - Add `source: 'linkedin' | 'naukri'` to route to correct scraper
   - Or: extend `JobPosting` with optional `source` and Naukri-specific fields

5. **`src/lambda.ts`** — Route based on `source` parameter
   - If `source === 'naukri'` → `NaukriJobsQuery`
   - If `source === 'linkedin'` (default) → existing `LinkedInJobsQuery`

6. **`src/index.ts`** — Export new modules
   - Export `NaukriJobsQuery`, `queryNaukriJobs`, naukri types and validator

7. **`src/test.ts`** — Add Naukri test case

8. **`template.yaml`** — Bump Lambda memory if we add Puppeteer later (256MB → 512MB)
   - Not needed for Phase 1 (API-only approach)

### Not modified
- `.gitignore`, `tsconfig.json`, `samconfig.toml` — unchanged
- `package.json` — no new dependencies for Phase 1 (just axios which we already have)

## Architecture: Side-by-Side with LinkedIn

```
lambda.handler(event)
  │
  ├─ source !== 'naukri' (default)
  │    └─ LinkedInJobsQuery → getJobs() → existing flow
  │
  └─ source === 'naukri'
       └─ NaukriJobsQuery → getJobs() → new flow
```

**Naukri flow:**
```
validateNaukriJobQueryOptions()
  → NaukriJobsQuery.getJobs()
    → fetchBatch(pageNo) → axios GET /jobapi/v3/search
    → parseResults(json) → extract JobPosting[]
    → [Phase 2: fetchJobDetails() enrichment]
    → return JobPosting[]
```

## API Parameter Mapping

| User Input | API Param | Notes |
|---|---|---|
| `keyword` | `keyword`, `k`, `seoKey` | Required, URL-encoded |
| `location` | `location` | City name |
| `experience` | `experience` | Years (0-30) |
| `jobAge` | `jobAge` | Days: 1, 3, 7, 15, 30 |
| `sort` | `sort` | `r` (relevance) or `f` (date) |
| `pageNo` | `pageNo` | 1-based pagination |
| `noOfResults` | `noOfResults` | Fixed at 20 |
| `wfhType` | `wfhType` | `0` office, `2` remote, `3` hybrid |

## Output: Unified Response Format

Naukri results use the same `JobPosting` interface where possible:

```json
{
  "id": "190924500863",
  "position": "Software Engineer (AI Build & Support)",
  "company": "Caterpillar Inc",
  "location": "Chennai, Bengaluru",
  "date": "2024-09-19",
  "salary": "7-11 Lacs",
  "jobUrl": "https://www.naukri.com/job-listings-software-engineer-...-190924500863",
  "companyLogo": "https://img.naukimg.com/...",
  "agoTime": "3 days ago",
  "details": {
    "descriptionText": "Full job description...",
    "employmentType": "Full Time, Permanent",
    "numApplicants": ""
  },
  "source": "naukri"
}
```

## Verification

1. **Unit test**: Call `queryNaukriJobs({ keyword: 'software engineer', location: 'bangalore', limit: 5 })` locally and verify structured output
2. **Lambda test**: `sam local invoke -e event-naukri.json` with Naukri params
3. **Edge cases**: empty keyword (400), no results (empty array), rate limiting (429 retry), invalid params (400)
4. **Compare**: Naukri output fields should match LinkedIn's `JobPosting` shape where semantically equivalent, with `source: 'naukri'` to distinguish

## Phase 2: Detail Enrichment (Separate Step)

**Prerequisite**: Use agent-browser to sniff Naukri's internal job detail API endpoint:
```bash
agent-browser open "https://www.naukri.com/job-listings-..."
# Capture XHR/fetch calls that load job description
```

Once the endpoint is found, add `fetchJobDetails()` to match LinkedIn's detail pattern — fetch full HTML description, education requirements, employment type, and company info per job, with the same concurrency + retry strategy.

## What We're NOT Doing

- No Puppeteer/Playwright in Phase 1 (too heavy, no confirmed need)
- No selenium — overkill for a JSON API
- No Apify dependency — keeping it self-hosted
- No LinkedIn post scraping — Naukri replaced that requirement
