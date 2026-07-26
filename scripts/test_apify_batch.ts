/**
 * scripts/test_apify_batch.ts
 * Standalone test script to test batch scraping of multiple LinkedIn URLs in a single Apify run.
 *
 * Usage:
 *   APIFY_TOKEN="apify_api_xxx" npx tsx scripts/test_apify_batch.ts
 *
 * Or edit API_KEY and TEST_URLS directly below and run:
 *   npx tsx scripts/test_apify_batch.ts
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const ACTOR_ID = 'hKByXkMQaC5Qt9UMN'; // curious_coder/linkedin-jobs-scraper
const JOBS_PER_URL = 100;

// Pass via environment variable APIFY_TOKEN or paste your key below:
const API_KEY = "apify key here";

// Array of LinkedIn search URLs to pass in a single batch request:
const TEST_URLS: string[] = [
  "https://www.linkedin.com/jobs/search?keywords=Backend%20Developer%20OR%20Software%20Engineer%20OR%20DevOps%20Engineer%20OR%20Cloud%20Engineer%20OR%20Associate%20Software%20Engineer%20OR%20Agentic%20AI%20OR%20AI%20Agent%20Engineer%20OR%20LLM%20Engineer&location=India&geoId=102713980&f_TPR=r86400&f_E=2&position=1&pageNum=0",
]

async function runTest() {
  console.log('=========================================');
  console.log(`Testing batch scraping with ${TEST_URLS.length} LinkedIn URL(s)`);
  console.log('=========================================');
  // TEST_URLS.forEach((url, index) => {
  //   console.log(`  [${index + 1}] ${url}`);
  // });

  const payload = {
    urls: TEST_URLS,
    count: JOBS_PER_URL,
    splitCountry: 'IN',
    useIncognitoMode: false,
  };

  console.log('\n--- Request Payload ---');
  console.log(JSON.stringify(payload, null, 2));
  console.log('-----------------------\n');

  console.log(`Calling Apify Actor (${ACTOR_ID}) synchronously... Please wait ~1-2 mins.`);
  const startTime = Date.now();

  const endpoint = `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items?token=${API_KEY}&format=json&clean=true&memory=1024`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(1);

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Apify HTTP ${res.status}: ${text}`);
    }

    const items: unknown = await res.json();

    if (!Array.isArray(items)) {
      throw new Error(`Apify returned non-array: ${JSON.stringify(items).slice(0, 200)}`);
    }

    console.log(`\n=========================================`);
    console.log(`✅ Success!`);
    console.log(`⏱️  Total time taken: ${elapsedSeconds} seconds (${(Number(elapsedSeconds) / 60).toFixed(2)} minutes)`);
    console.log(`📦 Total items returned: ${items.length}`);
    console.log(`=========================================`);

    const tempFilePath = path.join(process.cwd(), 'test_apify_results.json');
    await fs.writeFile(tempFilePath, JSON.stringify(items, null, 2), 'utf-8');
    console.log(`\n💾 Saved full results (${items.length} items) to temporary file:`);
    console.log(`   ${tempFilePath}`);

    if (items.length > 0) {
      console.log('\n--- RAW First Item Returned by Apify ---');
      console.log(JSON.stringify(items[0], null, 2));
      console.log('----------------------------------------\n');
    }
  } catch (err) {
    const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`\n=========================================`);
    console.error(`❌ Failed after ${elapsedSeconds} seconds (${(Number(elapsedSeconds) / 60).toFixed(2)} minutes):`, err);
    console.error(`=========================================`);
  }
}

runTest();
