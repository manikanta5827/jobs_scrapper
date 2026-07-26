import { fetchJobsForUser } from '../src/helper/job_fetcher.js';
import * as fs from 'node:fs/promises';

async function record() {
  console.log('--- RECORDING REAL DATA ---');
  try {
    const jobs = await fetchJobsForUser({
      suggestedJobTitles: ['Software Engineer', 'Backend Developer'],
      targetLocations: 'Bengaluru',
    }, 24);
    
    // Save it to the root of the project
    await fs.writeFile('mock_jobs.json', JSON.stringify(jobs, null, 2));
    console.log(`Success! ${jobs.length} jobs saved to mock_jobs.json`);
  } catch (err) {
    console.error('Recording failed:', err);
  }
}

record();
