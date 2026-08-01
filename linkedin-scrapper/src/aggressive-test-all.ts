import { handler as linkedinHandler } from './lambda-linkedin';
import { handler as simplyHiredHandler } from './lambda-simplyhired';
import { handler as naukriHandler } from './lambda-naukri';
import { handler as indeedHandler } from './lambda-indeed';

interface TestQuery {
  name: string;
  handler: (event: any) => Promise<any>;
  queries: {
    keyword: string;
    location: string;
    limit: string;
    [key: string]: string;
  }[];
}

const platforms: TestQuery[] = [
  {
    name: 'LinkedIn',
    handler: linkedinHandler,
    queries: [
      { keyword: 'Cloud Engineer', location: 'Bengaluru', limit: '50' },
      { keyword: 'DevOps Engineer', location: 'Hyderabad', limit: '50' },
    ],
  },
  {
    name: 'SimplyHired',
    handler: simplyHiredHandler,
    queries: [
      { keyword: 'Python Developer', location: 'Remote', limit: '50' },
      { keyword: 'Data Engineer', location: 'New York', limit: '50' },
    ],
  },
  {
    name: 'Naukri',
    handler: naukriHandler,
    queries: [
      { keyword: 'Cloud Developer', location: 'Mumbai', limit: '50' },
      { keyword: 'React Developer', location: 'Bangalore', limit: '50' },
    ],
  },
  {
    name: 'Indeed',
    handler: indeedHandler,
    queries: [
      { keyword: 'Backend Engineer', location: 'Remote', limit: '50' },
      { keyword: 'Full Stack', location: 'Remote', limit: '50' },
    ],
  },
];

async function runAggressiveTests() {
  console.log('🔥 STARTING AGGRESSIVE MULTI-INPUT TEST SUITE ACROSS ALL 4 PLATFORMS 🔥\n');

  for (const platform of platforms) {
    console.log(`==================================================================`);
    console.log(`📡 TESTING PLATFORM: ${platform.name}`);
    console.log(`==================================================================`);

    for (let i = 0; i < platform.queries.length; i++) {
      const q = platform.queries[i];
      console.log(`\n--- Query ${i + 1}: keyword="${q.keyword}", location="${q.location}", limit=${q.limit} ---`);
      const startTime = Date.now();

      try {
        const res = await platform.handler({
          queryStringParameters: q,
        });

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`Status Code: ${res.statusCode} (took ${elapsed}s)`);

        const body = JSON.parse(res.body);
        if (body.success && body.data) {
          const jobs = body.data;
          const total = jobs.length;
          const withDesc = jobs.filter(
            (j: any) =>
              (j.details && j.details.descriptionText && j.details.descriptionText.trim().length > 10) ||
              (j.snippet && j.snippet.trim().length > 10)
          ).length;
          const hasLogo = jobs.filter((j: any) => 'companyLogo' in j).length;

          console.log(`✅ Scraped Jobs: ${total} / Requested: ${q.limit}`);
          console.log(`📝 Jobs with Description/Snippet: ${withDesc} / ${total}`);
          console.log(`🚫 Jobs with companyLogo field: ${hasLogo} (Should be 0)`);

          if (total > 0) {
            const first = jobs[0];
            const descPreview = first.details?.descriptionText || first.snippet || 'NO DESCRIPTION';
            console.log(`\nSample Job 1 -> Position: ${first.position} | Company: ${first.company} | Location: ${first.location}`);
            console.log(`Preview: ${descPreview.substring(0, 150).replace(/\s+/g, ' ')}...`);
          } else {
            console.warn(`⚠️ WARNING: 0 jobs returned for query! Check if platform blocked or empty.`);
          }
        } else {
          console.error(`❌ ERROR in response body:`, body.error || 'Unknown error');
        }
      } catch (err: any) {
        console.error(`❌ EXCEPTION running ${platform.name}:`, err.message || err);
      }
      console.log(`------------------------------------------------------------------`);
    }
  }

  console.log('\n🏁 AGGRESSIVE TEST SUITE COMPLETED 🏁');
}

runAggressiveTests().catch(console.error);
