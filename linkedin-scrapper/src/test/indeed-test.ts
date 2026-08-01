import { handler } from '../lambda-indeed';

async function testIndeedJobs() {
  console.log('🚀 Testing Indeed Job Search with Puppeteer & Stealth...\n');

  const res = await handler({
    queryStringParameters: {
      keyword: 'backend developer',
      location: 'Remote',
      fromage: '7',
      jobType: 'fulltime',
      limit: '15',
    },
  });

  console.log('Status Code:', res.statusCode);
  const body = JSON.parse(res.body);

  if (body.success && body.data.length > 0) {
    console.log(`\nFound ${body.count} jobs:\n`);
    body.data.forEach((job: any, i: number) => {
      console.log(`--- Job ${i + 1} ---`);
      console.log('Position:', job.position);
      console.log('Company:', job.company);
      console.log('Location:', job.location);
      console.log('Salary:', job.salary);
      console.log('Source:', job.source);
      console.log('Ago Time / Date:', job.agoTime);
      console.log('URL:', job.jobUrl);
      console.log('Description:', job.details?.descriptionText?.substring(0, 200) + '...');
      console.log();
    });
  } else {
    console.log('No jobs found or error:', body.error);
  }
}

testIndeedJobs().catch((err) => console.error('Test Error:', err));
