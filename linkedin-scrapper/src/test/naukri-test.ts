import { handler } from '../lambda-naukri';

async function runTest(label: string, queries: any[]) {
  console.log(`\n==================================================`);
  console.log(`🚀 ${label}: Testing Naukri Scraper with ${queries.length} query/keywords...`);
  console.log(`==================================================\n`);

  const startTime = Date.now();
  try {
    const res = await handler({ queries } as any);
    const durationMs = Date.now() - startTime;
    const durationSec = (durationMs / 1000).toFixed(2);
    
    console.log(`\n⏱️ Execution Time for ${queries.length} keyword(s): ${durationSec} seconds (${(durationMs / 1000 / 60).toFixed(2)} minutes)`);
    console.log(`Status Code:`, res.statusCode);
    const body = JSON.parse(res.body);
    console.log(`Results:`, body);
  } catch (err) {
    const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error(`❌ Test Failed after ${durationSec}s:`, err);
  }
}

async function main() {
  const testMode = process.argv[2] || '1';

  if (testMode === '1') {
    await runTest('TEST 1 (1 Keyword)', [
      { keyword: 'React Developer', location: 'Mumbai', userIds: ['test-user-1'] }
    ]);
  } else if (testMode === '2') {
    await runTest('TEST 2 (2 Keywords)', [
      { keyword: 'React Developer', location: 'Mumbai', userIds: ['test-user-1'] },
      { keyword: 'Node.js Developer', location: 'Mumbai', userIds: ['test-user-1'] }
    ]);
  } else {
    await runTest('TEST BOTH (1 & 2 Keywords)', [
      { keyword: 'React Developer', location: 'Mumbai', userIds: ['test-user-1'] }
    ]);
    await runTest('TEST BOTH (2 Keywords)', [
      { keyword: 'React Developer', location: 'Mumbai', userIds: ['test-user-1'] },
      { keyword: 'Node.js Developer', location: 'Mumbai', userIds: ['test-user-1'] }
    ]);
  }
}

main().catch(console.error);
