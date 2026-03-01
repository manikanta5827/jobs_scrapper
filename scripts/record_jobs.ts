import { scrapeJobs } from '../src/helper/apify.js';
import * as fs from 'node:fs/promises';

const SEARCH_URLS = [
  'https://www.linkedin.com/jobs/search?keywords=Software%20Developer%20OR%20Software%20Engineer%20OR%20Backend%20Developer&location=Bengaluru&geoId=105214831&distance=25&f_TPR=r86400&f_E=2&position=1&pageNum=0'
];

async function record() {
  console.log('--- RECORDING REAL APIFY DATA ---');
  try {
    // await loadSecrets();
    const jobs = await scrapeJobs(SEARCH_URLS);
    
    // Save it to the root of the project
    await fs.writeFile('mock_jobs.json', JSON.stringify(jobs, null, 2));
    console.log(`Success! ${jobs.length} jobs saved to mock_jobs.json`);
  } catch (err) {
    console.error('Recording failed:', err);
  }
}

record();
