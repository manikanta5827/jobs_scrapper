import { handler as linkedinHandler } from '../lambda-linkedin';
import { handler as simplyhiredHandler } from '../lambda-simplyhired';

async function testBatchLambdas() {
  console.log('🧪 TESTING MULTI-QUERY BATCH LAMBDA INVOCATIONS WITH RANDOM JITTER (BATCH SIZE: 6) 🧪\n');

  const batchQueries = [
    { keyword: 'Backend Engineer', location: 'Bengaluru', limit: '10' },
    { keyword: 'Cloud Engineer', location: 'Hyderabad', limit: '10' },
    { keyword: 'DevOps Engineer', location: 'Remote', limit: '10' },
    { keyword: 'Python Developer', location: 'Pune', limit: '10' },
    { keyword: 'Data Engineer', location: 'Mumbai', limit: '10' },
    { keyword: 'Full Stack Developer', location: 'Delhi', limit: '10' },
  ];

  console.log(`Sending batch of ${batchQueries.length} query combinations to Lambda handlers...`);
  console.log('Queries:', batchQueries.map(q => `${q.keyword} (${q.location})`).join(' | '));
  console.log('\n==================================================================');
  console.log('1️⃣ TESTING LINKEDIN LAMBDA WITH BATCH OF 6 QUERIES');
  console.log('==================================================================');
  const startLi = Date.now();
  const liRes = await linkedinHandler({
    queries: batchQueries,
  });
  const elapsedLi = ((Date.now() - startLi) / 1000).toFixed(2);
  const liBody = JSON.parse(liRes.body);
  console.log(`✅ LinkedIn Response Status: ${liRes.statusCode} (took ${elapsedLi}s)`);
  console.log(`✅ Scraped & Deduplicated Total Jobs: ${liBody.count}`);
  if (liBody.data && liBody.data.length > 0) {
    console.log(`Sample Job 1 -> Position: "${liBody.data[0].position}" | Company: "${liBody.data[0].company}" | Location: "${liBody.data[0].location}"`);
    console.log(`Sample Job Middle -> Position: "${liBody.data[Math.floor(liBody.data.length / 2)].position}" | Company: "${liBody.data[Math.floor(liBody.data.length / 2)].company}"`);
    console.log(`Sample Job Last -> Position: "${liBody.data[liBody.data.length - 1].position}" | Company: "${liBody.data[liBody.data.length - 1].company}"`);
  }
  console.log('------------------------------------------------------------------\n');

  console.log('==================================================================');
  console.log('2️⃣ TESTING SIMPLYHIRED LAMBDA WITH BATCH OF 6 QUERIES');
  console.log('==================================================================');
  const startSh = Date.now();
  const shRes = await simplyhiredHandler({
    queries: batchQueries,
  });
  const elapsedSh = ((Date.now() - startSh) / 1000).toFixed(2);
  const shBody = JSON.parse(shRes.body);
  console.log(`✅ SimplyHired Response Status: ${shRes.statusCode} (took ${elapsedSh}s)`);
  console.log(`✅ Scraped & Deduplicated Total Jobs: ${shBody.count}`);
  if (shBody.data && shBody.data.length > 0) {
    console.log(`Sample Job 1 -> Position: "${shBody.data[0].position}" | Company: "${shBody.data[0].company}" | Location: "${shBody.data[0].location}"`);
    console.log(`Sample Job Middle -> Position: "${shBody.data[Math.floor(shBody.data.length / 2)].position}" | Company: "${shBody.data[Math.floor(shBody.data.length / 2)].company}"`);
    console.log(`Sample Job Last -> Position: "${shBody.data[shBody.data.length - 1].position}" | Company: "${shBody.data[shBody.data.length - 1].company}"`);
  }
  console.log('------------------------------------------------------------------');

  console.log('\n🏁 BATCH LAMBDA SUITE (6 QUERIES PER BATCH) COMPLETED SUCCESSFULLY 🏁');
}

testBatchLambdas().catch(console.error);
