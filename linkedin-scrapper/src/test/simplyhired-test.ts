import { handler } from '../lambda-simplyhired';

async function testSimplyHiredJobs() {
  console.log('🚀 Testing SimplyHired Job Search with filters...\n');

  const res = await handler({
    queryStringParameters: {
      keyword: 'backend developer',
      location: 'Remote',
      datePosted: '30days',
      jobType: 'fulltime',
      sort: 'date',
      limit: '35',
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
      console.log('Ago Time / Date:', job.date);
      console.log('URL:', job.jobUrl);
      console.log('Snippet:', job.details?.descriptionText?.substring(0, 150) + '...');
      console.log();
    });
  } else {
    console.log('No jobs found or error:', body.error);
  }
}

testSimplyHiredJobs().catch((err) => console.error('Test Error:', err));
