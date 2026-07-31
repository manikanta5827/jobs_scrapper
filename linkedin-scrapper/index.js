const { queryJobs } = require('./dist');

const queryOptions = {
  keyword: 'software engineer',
  location: 'Bengaluru',
  dateSincePosted: '24hr',
  jobType: ['full time', 'contract'],
  experienceLevel: ['entry level', 'associate'],
  remoteFilter: ['remote', 'hybrid'],
  limit: 2,
};

async function main() {
  console.log('🔍 Executing LinkedIn Job Search (All Details Included Automatically)...\n');
  
  try {
    const jobs = await queryJobs(queryOptions);
    console.log(`✅ Successfully fetched ${jobs.length} jobs with full details:\n`);
    console.log(JSON.stringify(jobs, null, 2));
  } catch (error) {
    console.error('❌ Error fetching jobs:', error.message);
  }
}

main();