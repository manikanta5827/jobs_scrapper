/**
 * scripts/test_deepseek_batch.ts
 * Standalone test to evaluate DeepSeek batch relevance checking with YOE pre-filter.
 * Runs yoePreFilter on 10 test jobs, shows filter stats, then LLM only on passing jobs.
 *
 * Usage:
 *   DEEPSEEK_API_KEY="sk-xxx" npx tsx scripts/test_deepseek_batch.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkRelevanceBatch, calculateCostUsd } from '../src/helper/llm';
import { yoePreFilter } from '../src/helper/filter';
import type { UserPromptContext } from '../src/helper/llm';
import type { Job, TokenUsage } from '../src/helper/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESUME_PATH = path.resolve(__dirname, '../resume.txt');
const CANDIDATE_YOE = 1;
const BATCH_SIZE = 10;

function readResume(): string {
  if (!fs.existsSync(RESUME_PATH)) {
    console.error(`Resume not found at ${RESUME_PATH}`);
    process.exit(1);
  }
  return fs.readFileSync(RESUME_PATH, 'utf-8').trim();
}

function buildCandidateContext(resume: string): UserPromptContext {
  return {
    experienceYears: CANDIDATE_YOE,
    resumeText: resume,
    primaryDomain: 'Backend & AI Engineering',
    candidateSummary: 'Backend Engineer with experience building serverless AWS applications, AI agents, and production SaaS products. Founder of Assessly, an AI-powered code assessment platform.',
    knownSkills: [
      'Node.js', 'TypeScript', 'JavaScript',
      'AWS Lambda', 'API Gateway', 'DynamoDB', 'S3', 'Amazon Bedrock',
      'Vercel AI SDK', 'PostgreSQL', 'Redis', 'Docker',
      'LLM Integration', 'AI Agent Design', 'RAG', 'Prompt Engineering',
      'Git', 'GitHub', 'CI/CD', 'Jest',
    ],
    keyHighlights: [
      'Built AI-powered hiring platform (Assessly) using AWS serverless + LLM code analysis',
      'Built WhatsApp AI accounting agent (Heymonsoon) with Gemini + tool-calling system',
    ],
    projects: [
      { project_title: 'Heymonsoon', project_description: 'AI-powered WhatsApp accounting agent for Indian SMEs — invoicing, GST compliance, receivables tracking via natural language. Uses Gemini 2.0 Flash + Vercel AI SDK with tool-calling for CRM, PDF generation, payment reconciliation.' },
      { project_title: 'Assessly (CodeVerdict.io)', project_description: 'AI-powered hiring platform evaluating candidate GitHub repos. Uses AWS Lambda, DynamoDB, S3, Bedrock, Vercel AI SDK for LLM-based code analysis.' },
    ],
    targetLocations: 'Hyderabad, Bangalore, Remote, India',
    employmentType: 'Full-time',
  };
}

function createTestJobs(): Job[] {
  return [
    {
      title: 'Backend Developer (Node.js / TypeScript)',
      companyName: 'TechCorp',
      location: 'Bangalore, Karnataka, India',
      seniorityLevel: 'Entry level',
      employmentType: 'Full-time',
      jobFunction: 'Engineering',
      industries: 'SaaS, Technology',
      salary: '₹8-12 LPA',
      descriptionText: 'We are looking for a Backend Developer with 0-2 years of experience to join our engineering team. You will build REST APIs, work with AWS Lambda, DynamoDB, and PostgreSQL. Required skills: Node.js, TypeScript, AWS, REST APIs, Git. Nice to have: Docker, CI/CD experience.',
      postedAt: '2026-07-27',
    },
    {
      title: 'AI Engineer / LLM Developer',
      companyName: 'AIStartup',
      location: 'Hyderabad, Telangana, India',
      seniorityLevel: 'Entry level',
      employmentType: 'Full-time',
      jobFunction: 'Engineering',
      industries: 'AI/ML, Technology',
      salary: '₹10-15 LPA',
      descriptionText: 'Join our AI team to build next-gen agentic systems. Required: 0-1 year experience, Node.js/TypeScript, experience with LLM APIs, prompt engineering, and AI agent design. Experience with Vercel AI SDK, LangChain, or similar frameworks is a plus. You will design and deploy RAG pipelines and multi-agent systems.',
      postedAt: '2026-07-27',
    },
    {
      title: 'Serverless Developer (AWS)',
      companyName: 'CloudNative Inc',
      location: 'Remote, India',
      seniorityLevel: 'Entry level',
      employmentType: 'Full-time',
      jobFunction: 'Engineering',
      industries: 'Cloud Computing',
      salary: '₹9-14 LPA',
      descriptionText: 'Looking for a Serverless Developer with 1-2 years experience. Must have hands-on experience with AWS Lambda, API Gateway, DynamoDB, and S3. TypeScript preferred. Build event-driven microservices and serverless APIs. Familiarity with Infrastructure as Code (CDK/SAM) is a bonus.',
      postedAt: '2026-07-27',
    },
    {
      title: 'Junior Fullstack Engineer',
      companyName: 'WebScale',
      location: 'Bangalore, Karnataka, India',
      seniorityLevel: 'Entry level',
      employmentType: 'Full-time',
      jobFunction: 'Engineering',
      industries: 'Internet, SaaS',
      salary: '₹7-10 LPA',
      descriptionText: 'We need a Junior Fullstack Engineer with 0-2 years experience. Backend focus with Node.js/TypeScript and PostgreSQL. Frontend experience with any modern framework (React/Vue) is a plus. You will work on API development, database design, and occasional frontend tasks. Docker experience preferred.',
      postedAt: '2026-07-26',
    },
    {
      title: 'Cloud Engineer (Python / AWS)',
      companyName: 'DataCloud',
      location: 'Hyderabad, Telangana, India',
      seniorityLevel: 'Entry level',
      employmentType: 'Full-time',
      jobFunction: 'Engineering',
      industries: 'Cloud Computing, Data',
      salary: '₹8-12 LPA',
      descriptionText: 'Cloud Engineer with 1-3 years experience wanted. Strong Python skills required for automation and scripting. Experience with AWS services (EC2, Lambda, S3, RDS) is essential. Knowledge of Terraform, Docker, and Kubernetes is a plus. You will manage cloud infrastructure and build internal tooling.',
      postedAt: '2026-07-26',
    },
    {
      title: 'Senior Backend Developer',
      companyName: 'EnterpriseX',
      location: 'Bangalore, Karnataka, India',
      seniorityLevel: 'Senior',
      employmentType: 'Full-time',
      jobFunction: 'Engineering',
      industries: 'Enterprise Software',
      salary: '₹25-40 LPA',
      descriptionText: 'We are hiring a Senior Backend Developer with minimum 5 years of experience building scalable distributed systems. Must have deep expertise in Node.js, TypeScript, PostgreSQL, AWS, and microservices architecture. You will lead technical design, mentor junior engineers, and drive architectural decisions. Experience with Kafka, gRPC, and Kubernetes is required.',
      postedAt: '2026-07-27',
    },
    {
      title: 'Embedded Systems Engineer',
      companyName: 'EmbedTech',
      location: 'Bangalore, Karnataka, India',
      seniorityLevel: 'Mid-level',
      employmentType: 'Full-time',
      jobFunction: 'Engineering',
      industries: 'Electronics, Automotive',
      salary: '₹12-18 LPA',
      descriptionText: 'Embedded Systems Engineer with 2+ years experience needed. Strong C/C++ programming skills required. Experience with microcontrollers (ARM, ESP32), RTOS, and communication protocols (CAN, SPI, I2C). Knowledge of Linux kernel development is a plus. You will develop firmware for automotive ECUs.',
      postedAt: '2026-07-26',
    },
    {
      title: 'Python / Django Developer',
      companyName: 'WebAgency',
      location: 'Remote, India',
      seniorityLevel: 'Mid-level',
      employmentType: 'Full-time',
      jobFunction: 'Engineering',
      industries: 'Web Development',
      salary: '₹10-15 LPA',
      descriptionText: 'Python Django Developer with 2-3 years experience. Build REST APIs using Django REST Framework. Must have experience with PostgreSQL, Redis, Celery, and AWS. Frontend knowledge (React.js) is a bonus. You will work on e-commerce platforms and internal dashboards.',
      postedAt: '2026-07-25',
    },
    {
      title: 'Engineering Manager / Tech Lead',
      companyName: 'BigCo',
      location: 'Hyderabad, Telangana, India',
      seniorityLevel: 'Director',
      employmentType: 'Full-time',
      jobFunction: 'Engineering Management',
      industries: 'Fintech',
      salary: '₹40-60 LPA',
      descriptionText: 'Engineering Manager with minimum 7+ years of experience, including at least 3 years in a people management role. You will lead a team of 10-15 engineers, drive delivery, manage stakeholder expectations, and own technical roadmaps. Must have background in fintech/payments domain. Strong Java/Spring Boot or Go experience required.',
      postedAt: '2026-07-27',
    },
    {
      title: 'QA Automation Engineer',
      companyName: 'TestPro',
      location: 'Chennai, Tamil Nadu, India',
      seniorityLevel: 'Mid-level',
      employmentType: 'Full-time',
      jobFunction: 'Quality Assurance',
      industries: 'IT Services',
      salary: '₹8-12 LPA',
      descriptionText: 'QA Automation Engineer with 2-3 years of experience. Must have strong skills in Selenium WebDriver, Java, TestNG, and API testing with Postman. Experience with CI/CD pipelines, JIRA, and Agile methodologies. You will design test automation frameworks and execute regression test suites.',
      postedAt: '2026-07-25',
    },
  ];
}

function printPreFilterSummary(
  allJobs: Job[],
  passToLLM: Job[],
  yoeRejected: Job[],
): void {
  console.log('═══════════════════════════════════════');
  console.log('YOE PRE-FILTER RESULTS');
  console.log('───────────────────────────────────────');
  console.log(`  Candidate YOE:  ${CANDIDATE_YOE} yr`);
  console.log(`  Total jobs:     ${allJobs.length}`);
  console.log(`  Passed to LLM:  ${passToLLM.length}`);
  console.log(`  YOE Rejected:   ${yoeRejected.length}`);
  console.log('');

  console.log('PASSED TO LLM:');
  console.log('──────────────');
  for (const job of passToLLM) {
    const yoe = (job as any).extractedYoeText ?? 'not detected';
    console.log(`  ✓ ${job.title}`);
    console.log(`    Extracted YOE: "${yoe}"`);
  }
  console.log('');

  console.log('YOE REJECTED (removed before LLM):');
  console.log('──────────────────────────────────');
  for (const job of yoeRejected) {
    console.log(`  ✗ ${job.title}`);
    console.log(`    Reason: ${(job as any).keyword_bin_reason ?? 'N/A'}`);
  }
  console.log('');
}

function formatJobResult(job: Job, index: number): string {
  const title = job.title ?? 'Unknown';
  const company = job.companyName ?? 'Unknown';
  const score = (job as any).ai_score ?? '?';
  const reason = (job as any).ai_reason ?? 'N/A';
  const matched = ((job as any).ai_matched_skills ?? []).join(', ') || '—';
  const missing = ((job as any).ai_missing_skills ?? []).join(', ') || '—';
  const yoe = (job as any).ai_yoe ?? 'N/A';
  const apply = (job as any).ai_direct_apply ?? 'N/A';

  const scoreNum = typeof score === 'number' ? score : 0;
  const emoji = scoreNum >= 85 ? '🟢' : scoreNum >= 65 ? '🟡' : scoreNum >= 45 ? '🟠' : '🔴';

  return [
    `${index + 1}. ${emoji} [${score}/100] ${title} @ ${company}`,
    `   Reason: ${reason}`,
    `   Matched Skills: ${matched}`,
    `   Missing Skills: ${missing}`,
    `   YOE Required: ${yoe}`,
    `   Direct Apply: ${apply}`,
    `   Location: ${job.location ?? 'N/A'}`,
    '',
  ].join('\n');
}

function printUsageSummary(usage: TokenUsage, preFilterTotal: number, yoeRejectedCount: number): void {
  const cost = calculateCostUsd(usage);
  console.log('═══════════════════════════════════════');
  console.log('TOKEN USAGE & COST');
  console.log('───────────────────────────────────────');
  console.log(`  Cache Hit Tokens:   ${usage.promptCacheHitTokens.toLocaleString()}`);
  console.log(`  Cache Miss Tokens:  ${usage.promptCacheMissTokens.toLocaleString()}`);
  console.log(`  Total Input:        ${(usage.promptCacheHitTokens + usage.promptCacheMissTokens).toLocaleString()}`);
  console.log(`  Output Tokens:      ${usage.completionTokens.toLocaleString()}`);
  console.log(`  Cache Hit Rate:     ${usage.promptCacheHitTokens > 0 ? ((usage.promptCacheHitTokens / (usage.promptCacheHitTokens + usage.promptCacheMissTokens)) * 100).toFixed(1) : '0'}%`);
  console.log(`  Cost:               $${cost.toFixed(6)}`);
  console.log('───────────────────────────────────────');
  console.log(`  Jobs sent to LLM:   ${preFilterTotal - yoeRejectedCount} / ${preFilterTotal}`);
  console.log(`  Filter cost saved:  ~$${(cost / (preFilterTotal - yoeRejectedCount) * yoeRejectedCount).toFixed(6)} (avoided for ${yoeRejectedCount} YOE-rejected jobs)`);
  console.log('═══════════════════════════════════════');
}

async function main() {
  if (!process.env.DEEPSEEK_API_KEY) {
    console.error('Missing DEEPSEEK_API_KEY. Set it via:');
    console.error('  export DEEPSEEK_API_KEY="sk-xxx"');
    console.error('Or:');
    console.error('  DEEPSEEK_API_KEY="sk-xxx" npx tsx scripts/test_deepseek_batch.ts');
    process.exit(1);
  }

  console.log('═══════════════════════════════════════');
  console.log('DEEPSEEK BATCH TEST — with YOE Pre-Filter');
  console.log('═══════════════════════════════════════');
  console.log('');

  const resume = readResume();
  console.log(`Resume loaded: ${resume.length} chars from resume.txt`);
  console.log(`Profile: ${CANDIDATE_YOE} year experience, Backend & AI Engineering`);
  console.log('');

  const context = buildCandidateContext(resume);
  const testJobs = createTestJobs();

  const { passToLLM, yoeRejected } = yoePreFilter(testJobs, CANDIDATE_YOE);
  printPreFilterSummary(testJobs, passToLLM, yoeRejected);

  console.log(`Sending ${passToLLM.length} jobs to DeepSeek (batch size: ${BATCH_SIZE})...`);
  console.log('');

  const startTime = Date.now();
  const { matched, rejected, usage } = await checkRelevanceBatch(
    passToLLM,
    context,
    BATCH_SIZE,
    0,
    1,
  );
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`DeepSeek completed in ${elapsed}s. Matched: ${matched.length}, Rejected by LLM: ${rejected.length}`);
  console.log('');

  const allLLMResults = [...matched, ...rejected];
  const jobOrder = new Map(passToLLM.map((j, i) => [j.title, i]));
  allLLMResults.sort((a, b) => (jobOrder.get(a.title!) ?? 99) - (jobOrder.get(b.title!) ?? 99));

  console.log('LLM RESULTS (post-filter):');
  console.log('───────────────────────────');
  for (let i = 0; i < allLLMResults.length; i++) {
    console.log(formatJobResult(allLLMResults[i], i));
  }

  console.log(`YOE-Rejected by filter: ${yoeRejected.length} jobs (no LLM cost)`);
  for (const job of yoeRejected) {
    console.log(`  ✗ ${job.title} — ${(job as any).keyword_bin_reason ?? 'N/A'}`);
  }
  console.log('');

  printUsageSummary(usage, testJobs.length, yoeRejected.length);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
