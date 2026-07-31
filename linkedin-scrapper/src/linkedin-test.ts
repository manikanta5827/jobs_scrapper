import { handler } from './lambda-linkedin';

async function testFullJobDescription() {
  console.log('🚀 Testing Job Query with automatic full details...');
  
  const res = await handler({
    queryStringParameters: {
      keyword: 'Software Engineer',
      location: 'Bengaluru',
      limit: '2',
    },
  });

  console.log('Status Code:', res.statusCode);
  const body = JSON.parse(res.body);

  if (body.success && body.data.length > 0) {
    const job = body.data[0];
    console.log('\n--- JOB 1 HIGHLIGHTS ---');
    console.log('ID:', job.id);
    console.log('Position:', job.position);
    console.log('Company:', job.company);
    console.log('Seniority Level:', job.details?.seniorityLevel);
    console.log('Employment Type:', job.details?.employmentType);
    console.log('Job Function:', job.details?.jobFunction);
    console.log('Industries:', job.details?.industries);
    console.log('Description Text Length:', job.details?.descriptionText?.length);
    console.log('Description Snippet:', job.details?.descriptionText?.substring(0, 300) + '...');
  }
}

testFullJobDescription().catch((err) => console.error('Test Error:', err));
