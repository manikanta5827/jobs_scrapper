# Jobs Scraper — LinkedIn + Naukri + SimplyHired + Indeed

Four independent Lambda functions — two lightweight HTTP scrapers and two Puppeteer browser scrapers. Each has its own parameter schema. All return the same `JobPosting` response shape. Designed for direct Lambda-to-Lambda invocation via AWS SAM.

---

## 🏛 Architecture

| Lambda | Source | Method | Memory | Timeout |
| :--- | :--- | :--- | :--- | :--- |
| `linkedin-jobs-scraper-{stage}` | LinkedIn | `axios` + `cheerio` (guest API) | 256 MB | 90s |
| `naukri-jobs-scraper-{stage}` | Naukri | Puppeteer + stealth (browser) | 1024 MB | 120s |
| `simplyhired-jobs-scraper-{stage}` | SimplyHired | `axios` (SSR `__NEXT_DATA__` JSON) | 256 MB | 90s |
| `indeed-jobs-scraper-{stage}` | Indeed | Puppeteer + stealth (browser) | 1024 MB | 120s |

All four return `JobPosting[]` with a `source` discriminator — downstream consumers don't change.

---

## 📖 LinkedIn Parameters

Pass an object containing `queryStringParameters`. All values are strings. At least one of `keyword` or `location` is required.

| Parameter | Type | Required | Allowed Values | Description |
| :--- | :--- | :--- | :--- | :--- |
| `keyword` | `string` | **Yes*** | `Software Engineer` | Job title or search phrase |
| `location` | `string` | **Yes*** | `Bengaluru`, `India`, `Remote` | Location name |
| `dateSincePosted` | `string` | No | `24hr`, `past 24 hours`, `past week`, `past month` | Job freshness |
| `jobType` | `string \| array` | No | `full time`, `part time`, `contract`, `temporary`, `volunteer`, `internship` | Employment type |
| `remoteFilter` | `string \| array` | No | `on-site`, `remote`, `hybrid` | Workplace policy |
| `experienceLevel` | `string \| array` | No | `internship`, `entry level`, `associate`, `senior`, `director`, `executive` | Seniority level |
| `sortBy` | `string` | No | `recent`, `relevant` | Result ordering |
| `company` | `string \| array` | No | Company IDs e.g. `1035` or `['1035','1441']` | LinkedIn company ID filter |
| `salary` | `string \| number` | No | `40000`, `60000`, `80000`, `100000`, `120000` | Minimum annual USD salary |
| `geoId` | `string` | No | `102713980` (India), `103644278` (US) | LinkedIn geographic ID |
| `easyApply` | `boolean` | No | `true`, `false` | Easy Apply filter |
| `has_verification` | `boolean` | No | `true`, `false` | Verified recruiter filter |
| `under_10_applicants` | `boolean` | No | `true`, `false` | Low-competition filter |
| `limit` | `number` | No | `1` – `100` (default `25`) | Max results |
| `page` | `number` | No | `0`, `1`, `2`… (default `0`) | Pagination offset |
| `proxyUrl` | `string` | No | `http://user:pass@proxy:port` | Rotating proxy URL |

---

## 📖 Naukri Parameters

`keyword` is always required. All values are strings.

| Parameter | Type | Required | Allowed Values | Description |
| :--- | :--- | :--- | :--- | :--- |
| `keyword` | `string` | **Yes** | `Backend Developer` | Job title or search phrase |
| `location` | `string` | No | `Hyderabad`, `Bengaluru` | City name |
| `experience` | `number` | No | `0` – `30` | Required years of experience |
| `jobAge` | `number` | No | `1`, `3`, `7`, `15`, `30` | Job freshness in days |
| `wfhType` | `string \| array` | No | `office`, `remote`, `hybrid` | Work mode filter. Comma-separated or array |
| `sort` | `string` | No | `relevance`, `date` | Result ordering |
| `limit` | `number` | No | `1` – `100` (default `25`) | Max results |
| `page` | `number` | No | `0`, `1`, `2`… (default `0`) | Pagination offset |
| `proxyUrl` | `string` | No | `http://user:pass@proxy:port` | Rotating proxy URL |

---

## 📖 SimplyHired Parameters

At least one of `keyword` or `location` is required. All values are strings. Data is extracted from the SSR'd `__NEXT_DATA__` JSON blob in the page HTML — no browser needed.

| Parameter | Type | Required | Allowed Values | Description |
| :--- | :--- | :--- | :--- | :--- |
| `keyword` | `string` | **Yes*** | `backend developer fresher` | Job title or search phrase (include experience keywords here, e.g. "fresher", "senior") |
| `location` | `string` | **Yes*** | `remote`, `San Francisco`, `India` | Location name |
| `datePosted` | `string` | No | `24hr` (`1`), `3days` (`3`), `7days` (`7`), `14days` (`14`), `30days` (`30`) | Job freshness filter (maps to URL `t` parameter) |
| `jobType` | `string \| array` | No | `fulltime` (`CF3CP`), `contract` (`NJXCK`), `parttime` (`75GKK`), `permanent` (`5QWDV`), `freelance` (`ZG59D`), `temp-to-hire` (`7SBAT`), `temporary` (`4HKF7`), `internship` (`VDTG7`) | Employment type names or native codes (maps to URL `jt` parameter) |
| `remote` | `boolean` | No | `true`, `false` | Remote-only filter |
| `sort` | `string` | No | `relevance`, `date` | Result ordering (`s=d` for date sort) |
| `distance` | `number` | No | `25`, `50`, `100` | Search radius in kilometers/miles (maps to URL `sr` parameter) |
| `domain` | `string` | No | `com`, `co.in` | Base domain (defaults to `co.in` if location contains `india`, `com` otherwise) |
| `limit` | `number` | No | `1` – `100` (default `25`) | Max results |
| `page` | `number` | No | `1`, `2`, `3`… (default `1`) | Pagination (20 jobs/page) |

---

## 📖 Indeed Parameters

At least one of `keyword` or `location` is required. Uses Puppeteer with stealth plugin to bypass Cloudflare.

| Parameter | Type | Required | Allowed Values | Description |
| :--- | :--- | :--- | :--- | :--- |
| `keyword` | `string` | **Yes*** | `backend developer` | Job title or search phrase |
| `location` | `string` | **Yes*** | `Remote`, `San Francisco`, `India` | Location name |
| `fromage` | `number` | No | `1`, `3`, `7`, `14`, `30` | Maximum age of jobs in days |
| `jobType` | `string \| array` | No | `fulltime`, `parttime`, `contract`, `internship`, `temporary` | Employment type filter |
| `sort` | `string` | No | `relevance`, `date` | Result ordering (`sort=date` on Indeed) |
| `salary` | `string \| number` | No | `50000`, `80000`, `100000` | Minimum salary filter |
| `limit` | `number` | No | `1` – `100` (default `25`) | Max results |
| `page` | `number` | No | `0`, `1`, `2`… (default `0`) | Pagination offset |
| `proxyUrl` | `string` | No | `http://user:pass@proxy:port` | Rotating proxy URL |

---

## 🛠 Tech Stack

- **Language**: TypeScript / Node.js 22.x
- **Build Tool**: AWS SAM + `esbuild`
- **HTTP Clients**: `axios` (v1.x) + Cheerio (v1.x) for LinkedIn & SimplyHired
- **Browser Automation**: `puppeteer-extra` + `puppeteer-extra-plugin-stealth` + `@sparticuz/chromium` (Lambda) / system Chrome (local) for Naukri & Indeed
- **Proxy Support**: `https-proxy-agent`

---

## 🧪 Local Testing

```bash
# Build
npm run build

# LinkedIn test (axios + guest API)
npm run test:linkedin

# Naukri test (Puppeteer + full details)
npm run test:naukri

# SimplyHired test (axios + SSR data)
npm run test:simplyhired

# Indeed test (Puppeteer + stealth plugin)
npm run test:indeed

# SAM local invocation
sam build && sam local invoke LinkedInScraperFunction -e event.json
sam build && sam local invoke NaukriScraperFunction -e event.json
sam build && sam local invoke SimplyHiredScraperFunction -e event.json
sam build && sam local invoke IndeedScraperFunction -e event.json
```

---

## 🚀 AWS Deployment

```bash
sam build
sam deploy --config-env dev    # Development stack
sam deploy --config-env prod   # Production stack
```

---

## 💻 Lambda Invocation Examples

### Indeed

```typescript
const payload = {
  queryStringParameters: {
    keyword: 'backend developer',
    location: 'Remote',
    fromage: '7',
    jobType: 'fulltime',
    sort: 'date',
    limit: '5',
  },
};

const command = new InvokeCommand({
  FunctionName: 'indeed-jobs-scraper-prod',
  Payload: Buffer.from(JSON.stringify(payload)),
});

const response = await lambdaClient.send(command);
const result = JSON.parse(Buffer.from(response.Payload!).toString());
const body = JSON.parse(result.body);
console.log(`Found ${body.count} Indeed jobs`);
```

---

## 📥 Response Format

All four Lambdas return the same shape. Use `source` to distinguish.

```json
{
  "statusCode": 200,
  "headers": { "Content-Type": "application/json" },
  "body": {
    "success": true,
    "count": 2,
    "data": [
      {
        "id": "667a8d993c041739",
        "position": "Backend C#/.NET Developer",
        "company": "AuraOne Human Data",
        "location": "Remote",
        "date": "",
        "salary": "Not specified",
        "jobUrl": "https://www.indeed.com/viewjob?jk=667a8d993c041739",
        "companyLogo": "",
        "agoTime": "Just posted",
        "source": "indeed",
        "details": {
          "descriptionText": "Backend C#/.NET Developer is a remote engineering review track..."
        }
      }
    ]
  }
}
```

| Response Field | Description | LinkedIn | Naukri | SimplyHired | Indeed |
| :--- | :--- | :---: | :---: | :---: | :---: |
| `id` | Platform-specific job ID | ✅ | ✅ | ✅ | ✅ |
| `position` | Job title | ✅ | ✅ | ✅ | ✅ |
| `company` | Company name | ✅ | ✅ | ✅ | ✅ |
| `location` | Location string | ✅ | ✅ | ✅ | ✅ |
| `date` | Published date | ✅ | — | ✅ | — |
| `salary` | Salary range string | ✅ | ✅ | ✅ | ✅ |
| `jobUrl` | Direct link to job listing | ✅ | ✅ | ✅ | ✅ |
| `companyLogo` | Logo image URL | ✅ | ✅ | ✅ | — |
| `agoTime` | Human-readable posted time | ✅ | ✅ | ✅ | ✅ |
| `source` | `linkedin`, `naukri`, `simplyhired`, or `indeed` | ✅ | ✅ | ✅ | ✅ |
| `details.descriptionText` | Full job description plain text | ✅ | ✅ | ✅ | ✅ |

---

## 🔍 Field Extraction by Platform

| Platform | Method | Scraping Technique | Full Description |
| :--- | :--- | :--- | :---: |
| **LinkedIn** | `axios` | Guest API (`jobs-guest/api/seeMoreJobPostings`) + per-job detail pages | ✅ (per-job HTTP fetch) |
| **Naukri** | Puppeteer + stealth | DOM extraction from search page + per-job detail tabs | ✅ (per-job browser navigation) |
| **SimplyHired** | `axios` | SSR'd `__NEXT_DATA__` JSON from page HTML + inline `viewJobData` | ✅ (one request per page) |
| **Indeed** | Puppeteer + stealth | DOM extraction from search page + per-job viewjob detail pages | ✅ (per-job browser navigation) |
