import { handler } from './lambda-naukri';

async function testNaukriJobs() {
  console.log('🚀 Testing Naukri Job Search with Puppeteer...\n');

  const res = await handler({
    queryStringParameters: {
      keyword: 'backend developer',
      location: 'Hyderabad',
      jobAge: '7',
      wfhType: 'remote,hybrid',
      sort: 'date',
      experience: '3',
      limit: '3',
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
      console.log('Posted:', job.agoTime);
      console.log('URL:', job.jobUrl);
      console.log('Source:', job.source);
      console.log('Description:', job.details?.descriptionText?.substring(0, 200) + '...');
      console.log();
    });
  } else {
    console.log('No jobs found or error:', body.error);
  }
}

testNaukriJobs().catch((err) => console.error('Test Error:', err));
