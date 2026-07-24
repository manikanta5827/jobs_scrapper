# Job Auto-Apply Feature — Architecture Design

**Date:** 2026-06-29
**Status:** Design Approved — Pending Implementation

---

## 1. Problem Summary

Five distinct job application types encountered in the wild:

| # | Type | Example URL pattern | Automation Target |
|---|------|---------------------|-------------------|
| 1 | LinkedIn Easy Apply | `linkedin.com/jobs/…` + Easy Apply button | Extension clicks modal |
| 2 | Custom career page / ATS | `greenhouse.io`, `lever.co`, `icims.com`, company page | Extension fills web form |
| 3 | Workday | `myworkdayjobs.com/…` | Extension fills multi-page form |
| 4 | Google Form | `docs.google.com/forms/…` | Extension visits form, fills, submits |
| 5 | Email application | Email address in listing body | Extension opens Gmail compose |

**Goal:** Auto-apply to all five types without requiring manual user action per job. ~88% fully automated, remainder falls back to Telegram notification.

---

## 2. Architecture Overview

**Lambda**: finds jobs, scores them, classifies type, writes to queue, sends Telegram.
**Chrome Extension**: polls queue, opens background tab per job, applies, reports back.

No cloud browser service. Extension runs in user's real Chrome — same IP, same session cookies, same fingerprint as a human. Bot detection has nothing to catch.

```
┌──────────────────────────────────────────────────────────────┐
│                  MainLambda (existing, unchanged)             │
│                                                              │
│  scrape → dedup → keyword filter → DeepSeek score           │
│       ↓                                                      │
│  classify(job) → write pending_applications (Postgres)       │
│       ↓                                                      │
│  Telegram: "Found 6 jobs, applying now..."                   │
└──────────────────────────────────────────────────────────────┘
                           ↓
              [Postgres: pending_applications]
                           ↓
┌──────────────────────────────────────────────────────────────┐
│               Chrome Extension (user's Chrome)               │
│                                                              │
│  Background worker polls GET /pending-applications every 5m  │
│                                                              │
│  For each pending job → open background tab → inject script: │
│                                                              │
│  linkedin_easy_apply → click Easy Apply, fill modal, submit  │
│  workday            → navigate multi-page form, fill, submit │
│  greenhouse/lever   → load apply page, fill, upload, submit  │
│  google_form        → load form, read entry IDs, fill,submit │
│  email              → open mail.google.com compose, send     │
│  web_form           → AI field detection, fill, submit       │
│                                                              │
│  → POST /application-result { jobId, status, failReason }   │
└──────────────────────────────────────────────────────────────┘
                           ↓
              Lambda records result + Telegram confirm:
              "Applied to Senior Backend Eng @ Stripe ✓"
                           ↓
                  Tier 3: Telegram fallback
                  (CAPTCHA, 2FA, unknown form type)
                  "Can't auto-apply to [Company]. Apply here: {url}"
```

---

## 3. Why Extension, Not Cloud Browser (Browserbase / AgentCore / Cloudflare)

| Factor | Cloud headless browser | Chrome Extension |
|--------|----------------------|-----------------|
| Workday success rate | ~15% (Akamai blocks datacenter IPs) | ~78% (real IP, real Chrome) |
| LinkedIn Easy Apply | ~75% | ~95% (real LinkedIn session) |
| Greenhouse / Lever | ~60% | ~85% (real browser, real form flow) |
| Cost | $20–250/mo | $0 |
| Gmail sending | Needs OAuth2 + SSM token | User already logged in |
| Google Forms | Scrape HTML from Lambda (fragile) | Read DOM directly (trivial) |
| Resume upload | Multipart HTTP in Lambda (complex) | Simulate file input (trivial) |
| Setup for user | Nothing | Install extension once |

Cloud headless browsers are blocked on Workday (25–30% of enterprise job postings). Extension wins on every metric.

---

## 4. Classification Logic (Lambda)

```typescript
type ApplyType =
  | 'linkedin_easy_apply'
  | 'workday'
  | 'greenhouse'
  | 'lever'
  | 'google_form'
  | 'email'
  | 'web_form';

function classifyJob(job: Job): ApplyType {
  if (job.isEasyApply) return 'linkedin_easy_apply';
  const url = job.applyUrl ?? '';
  if (url.includes('myworkdayjobs.com'))   return 'workday';
  if (url.includes('docs.google.com/forms')) return 'google_form';
  if (url.includes('greenhouse.io'))       return 'greenhouse';
  if (url.includes('lever.co'))            return 'lever';
  if (!url || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(url)) return 'email';
  return 'web_form';
}
```

---

## 5. DB Schema Addition

One new table in existing Neon Postgres (Drizzle migration):

```typescript
// src/db/schema.ts
export const pendingApplications = pgTable('pending_applications', {
  id: serial('id').primaryKey(),
  jobId: text('job_id').notNull(),
  url: text('url').notNull(),
  type: text('type').notNull(),
  status: text('status').notNull().default('pending'), // pending | applied | failed | manual
  failReason: text('fail_reason'),
  createdAt: timestamp('created_at').defaultNow(),
  appliedAt: timestamp('applied_at'),
});
```

---

## 6. Extension Flow — Per Job Type

### linkedin_easy_apply
```
Open linkedin.com/jobs/{id} in background tab
→ Click "Easy Apply" button
→ Loop through modal screens: fill name, phone, resume upload, questions
→ Click Submit
→ Close tab, report applied
```

### workday
```
Open myworkdayjobs.com/…/apply in background tab
→ If login required: user's Workday account cookie already present
→ Fill multi-page form (personal info → experience → resume upload → review)
→ Submit
→ If email verification page: send Telegram HitL link, pause
```

### greenhouse / lever
```
Open apply page in background tab
→ Read form fields from DOM
→ Fill name, email, phone, LinkedIn URL, GitHub URL
→ Simulate file input click → attach resume blob from extension storage
→ Click Submit
→ Close tab, report applied
```

### google_form
```
Open docs.google.com/forms/…/viewform in background tab
→ Content script reads all input elements, maps entry IDs
→ Fills each field with profile data
→ Handles file upload question if present (simulate file input)
→ Clicks Submit
→ No authentication needed (public forms)
```

### email
```
Open mail.google.com in background tab (user already logged in)
→ Content script opens compose window
→ Fills To: {hrEmail}, Subject: "Application for {title} — {name}"
→ Fills body: generated cover letter + profile summary
→ Attaches resume (from extension storage as Blob)
→ Clicks Send
→ Close tab, report applied
```
Email arrives from user's real Gmail address. Appears in their Sent folder. HR sees their name and email. Indistinguishable from manually sent.

### web_form (generic fallback)
```
Open career page URL in background tab
→ Snapshot form HTML → send to DeepSeek: "map these fields to profile data"
→ DeepSeek returns: { "#firstName": "Manikanta", "#resume": FILE, ... }
→ Fill fields, upload resume, submit
→ If confidence < threshold: Telegram fallback
```

---

## 7. Human Fallback (Tier 3)

Triggers when:
- Extension detects CAPTCHA that survives 2 retries
- Email/phone verification required (2FA)
- Form type unrecognized after AI attempt
- Extension reports `status: failed`

Telegram message:
```
⚠️ Can't auto-apply to {Company} ({type})
Reason: {failReason}
Apply manually: {url}
```

---

## 8. User Profile Storage

Extension stores profile in `chrome.storage.sync` (encrypted, syncs across Chrome installs):

```typescript
interface CandidateProfile {
  fullName: string;
  email: string;
  phone: string;
  linkedinUrl: string;
  githubUrl: string;
  portfolioUrl?: string;
  // Resume stored as ArrayBuffer in chrome.storage.local (up to 10MB)
}
```

User fills this once via extension popup. Resume uploaded once, cached locally in extension.

---

## 9. Infrastructure Changes

### Lambda additions (minimal)
- `classifyJob()` added to `src/lambda.ts` after AI scoring
- Insert into `pending_applications` per matched job
- Two new routes on AdminLambda:
  - `GET /pending-applications` — extension polls, returns `pending` rows
  - `POST /application-result` — extension reports outcome, updates row

### DB
- One Drizzle migration: `pending_applications` table
- No new Postgres instance — same Neon DB

### Extension (new, separate build)
- Chrome MV3 extension
- Background service worker: polls every 5 min, opens tabs
- Content scripts: per ATS handler + generic AI fallback
- Popup: profile setup UI

### Removed from previous design
- ❌ Browserbase ($20/mo, 0 value over extension)
- ❌ `BROWSERBASE_API_KEY`, `BB_PROJECT_ID` SSM params
- ❌ `@browserbasehq/sdk` npm package
- ❌ Gmail OAuth2 setup script, `CANDIDATE_GMAIL_REFRESH_TOKEN` SSM param
- ❌ `googleapis`, `nodemailer` packages
- ❌ SQS ApplyQueue (Postgres table replaces it)
- ❌ Bot LinkedIn / bot Google accounts

---

## 10. Cost

| Component | Cost |
|-----------|------|
| Chrome Extension | $0 |
| Postgres (existing Neon) | $0 (free tier) |
| DeepSeek (generic form AI) | ~$0.01/form, ~$1–2/mo |
| AdminLambda extra routes | $0 (within free tier) |
| **Total added cost** | **~$1–2/mo** |

Previous design: $20/mo (Browserbase). New design: ~$1–2/mo. Better coverage, lower cost.

---

## 11. Expected Coverage

| Platform | Method | Expected Rate |
|----------|--------|---------------|
| LinkedIn Easy Apply | Extension: click modal | ~95% |
| Greenhouse | Extension: fill apply page | ~85% |
| Lever | Extension: fill apply page | ~85% |
| Google Forms | Extension: fill form | ~90% |
| Email | Extension: Gmail compose | ~98% |
| Workday | Extension: multi-page form | ~78% |
| iCIMS / SmartRecruiters | Extension: generic form | ~80% |
| Custom career pages | Extension: AI detection | ~75% |
| **Overall** | | **~85–88%** |
| Remainder | Telegram fallback | ~12–15% |

---

## 12. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Chrome is closed → no extension | Jobs queue in DB; extension applies in batch next time Chrome opens |
| LinkedIn detects extension activity | Rate limit: max 5 Easy Apply per hour; randomize delays |
| Workday multi-page form changes structure | Per-type handler updated; fallback to AI detection |
| Google Form has file upload + sign-in required | Falls back to Tier 3 Telegram link (rare) |
| Resume file too large for chrome.storage | Store in chrome.storage.local (10 MB limit, plenty for PDF) |

---

## 13. Implementation Phases

**Phase 1:** DB migration + Lambda classify + AdminLambda routes
**Phase 2:** Extension scaffold + profile setup popup + polling worker
**Phase 3:** LinkedIn Easy Apply handler + email handler (Gmail compose)
**Phase 4:** Greenhouse + Lever + Google Forms handlers
**Phase 5:** Workday handler + generic AI form detection + Tier 3 fallback
