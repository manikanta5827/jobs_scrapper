/**
 * scripts/test_deepseek_batch.ts
 *
 * Usage:
 *   npx tsx scripts/test_deepseek_batch.ts --prefilter-only    (no API key needed)
 *   LLM_API_KEY="sk-xxx" npx tsx scripts/test_deepseek_batch.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { calculateCostUsd, extractJobFitFactsBatch } from '../src/services/llm';
import { yoePreFilter, extractYoeRange } from '../src/utils/filter';
import type { Job, EnrichedJob, JobFitFacts, TokenUsage, UserPromptContext } from '../src/types';


const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESUME_PATH = path.resolve(__dirname, '../resume.txt');
const CANDIDATE_YOE = 1;
const BATCH_SIZE = 10;

const CATEGORY_MAP: Record<string, { score: number; pass: boolean; label: string }> = {
  strong_match:        { score: 5, pass: true,  label: 'Strong Match' },
  minor_gaps:          { score: 4, pass: true,  label: 'Minor Gaps' },
  experience_mismatch: { score: 2, pass: false, label: 'Experience Mismatch' },
  skills_mismatch:     { score: 1, pass: false, label: 'Skills Mismatch' },
  no_match:            { score: 0, pass: false, label: 'No Match' },
};

interface AugmentedJob extends Job {
  _expectedAction?: 'pass' | 'reject';
  _expectedMin?: number | null;
  _yoeNote?: string;
}

function readResume(): string {
  if (!fs.existsSync(RESUME_PATH)) { process.exit(1); }
  return fs.readFileSync(RESUME_PATH, 'utf-8').trim();
}

function buildCandidateContext(resume: string): UserPromptContext {
  return {
    experienceYears: CANDIDATE_YOE,
    resumeText: resume,
    primaryDomain: 'Backend & AI Engineering',
    candidateSummary: 'Backend Engineer with 1 year of experience building serverless AWS applications, AI agents, and production SaaS products. Founder of Assessly (CodeVerdict.io), an AI-powered code assessment platform.',
    knownSkills: [
      'Node.js', 'TypeScript', 'JavaScript',
      'AWS Lambda', 'AWS Serverless', 'API Gateway', 'S3', 'EC2', 'CloudWatch', 'Amazon Bedrock',
      'Cloudflare Serverless',
      'LLM Integration', 'Vercel AI SDK', 'Prompt Engineering', 'AI Agent Design', 'RAG', 'Sub Agents', 'MCP',
      'PostgreSQL', 'DynamoDB', 'Redis', 'Vector DB', 'Supabase', 'LibSQL',
      'Docker', 'Git', 'GitHub', 'CI/CD', 'Jest',
      'Google Gemini', 'SvelteKit', 'WhatsApp API', 'GitHub APIs', 'REST APIs', 'Event-driven Architecture',
    ],
    keyHighlights: [
      'Built AI-powered hiring platform that evaluates GitHub repositories and generates engineering reports in under one minute',
      'Developed AI WhatsApp accounting agent for Indian SMEs using Gemini and Vercel AI SDK',
      'Built automated job-search pipeline that scrapes listings and matches them with LLM-based analysis',
    ],
    projects: [
      { project_title: 'Assessly (CodeVerdict.io)', project_description: 'AI-powered code assessment platform for hiring teams. Ingests GitHub repositories via S3, AWS Lambda, and Bedrock; generates engineering review reports. Node.js, AWS Serverless, Vercel AI SDK.' },
      { project_title: 'Heymonsoon', project_description: 'AI WhatsApp accounting agent for Indian SMEs. Handles invoicing, GST compliance, and receivables via natural language. SvelteKit, TypeScript, Google Gemini, Vercel AI SDK, LibSQL.' },
      { project_title: 'Job Search Automation Engine', project_description: 'Automated pipeline that scrapes job listings, matches them against a candidate profile using LLM analysis, and surfaces relevant roles daily. Node.js, Web Scraping, AI Agents, AWS.' },
    ],
    targetLocations: 'Hyderabad, Bangalore, Remote, India',
    employmentType: 'Full-time',
  };
}

// ── 12 tailored test jobs loaded from test_jobs.json ────────────────────────

const TEST_JOBS_PATH = path.resolve(__dirname, './test_jobs.json');

function createTestJobs(): AugmentedJob[] {
  if (!fs.existsSync(TEST_JOBS_PATH)) {
    console.error(`Test jobs file not found: ${TEST_JOBS_PATH}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(TEST_JOBS_PATH, 'utf-8')) as AugmentedJob[];
}

// ── Output ──────────────────────────────────────────────────────────────────

function printPreFilterSummary(
  allJobs: AugmentedJob[],
  passToLLM: AugmentedJob[],
  yoeRejected: AugmentedJob[],
): void {
  console.log('═══════════════════════════════════════');
  console.log('YOE PRE-FILTER — Per-Job Breakdown');
  console.log('───────────────────────────────────────');
  console.log(`  Candidate YOE:  ${CANDIDATE_YOE} yr`);
  console.log(`  Total jobs:     ${allJobs.length}`);
  console.log(`  Passed to LLM:  ${passToLLM.length}`);
  console.log(`  YOE Rejected:   ${yoeRejected.length}`);
  console.log('');

  const hdr = (label: string) => { console.log(label); console.log('─'.repeat(80)); };

  hdr('PASSED TO LLM');
  for (const job of passToLLM) {
    const { min, max, fullText } = extractYoeRange((job.descriptionText ?? '') + ' ' + (job.seniorityLevel ?? ''));
    const yoeDisplay = fullText ?? 'not detected';
    const rangeDisplay = formatYoeRange(min, max);

    let infoTag = '';
    if (job._expectedMin != null && min !== job._expectedMin) {
      infoTag = ` ℹ regex: expected min=${job._expectedMin}, got ${min ?? 'null'}`;
    }

    console.log(`  ✓ ${job.title} @ ${job.companyName}${infoTag}`);
    console.log(`    Note    : ${job._yoeNote ?? '—'}`);
    console.log(`    YOE text: "${yoeDisplay}"`);
    console.log(`    YOE     : ${rangeDisplay}`);
  }
  console.log('');

  hdr('YOE REJECTED');
  for (const job of yoeRejected) {
    const { min, max, fullText } = extractYoeRange((job.descriptionText ?? '') + ' ' + (job.seniorityLevel ?? ''));
    const yoeDisplay = fullText ?? 'not detected';
    const rangeDisplay = formatYoeRange(min, max);

    let reason = '';
    if (min !== null && min > CANDIDATE_YOE) {
      reason = `requires ${min}+ yr > candidate ${CANDIDATE_YOE} yr`;
    } else if (max !== null && max < CANDIDATE_YOE) {
      reason = `requires ${max}- yr max < candidate ${CANDIDATE_YOE} yr`;
    }

    console.log(`  ✗ ${job.title} @ ${job.companyName}`);
    console.log(`    Note    : ${job._yoeNote ?? '—'}`);
    console.log(`    YOE text: "${yoeDisplay}"`);
    console.log(`    YOE     : ${rangeDisplay}`);
    console.log(`    Reason  : ${reason}`);
  }
  console.log('');

  const underqualified = yoeRejected.filter(j => {
    const { min } = extractYoeRange((j.descriptionText ?? '') + ' ' + (j.seniorityLevel ?? ''));
    return min !== null && min > CANDIDATE_YOE;
  }).length;
  const overqualified = yoeRejected.length - underqualified;

  console.log(`   Rejected: ${yoeRejected.length} total (${underqualified} underqualified, ${overqualified} overqualified).`);
  console.log('');
}

function formatYoeRange(min: number | null, max: number | null): string {
  if (min !== null && max !== null) return `${min}-${max} yr`;
  if (min !== null) return `${min}+ yr`;
  if (max !== null) return `0-${max} yr`;
  return 'not detected';
}

function formatJobResult(job: Job, index: number): string {
  const title = job.title ?? 'Unknown';
  const company = job.companyName ?? 'Unknown';
  const score = (job as any).ai_score ?? '?';
  const category = (job as any).ai_category as keyof typeof CATEGORY_MAP | undefined;
  const reason = (job as any).ai_reason ?? 'N/A';
  const matched = ((job as any).ai_matched_skills ?? []).join(', ') || '—';
  const missing = ((job as any).ai_missing_skills ?? []).join(', ') || '—';
  const yoe = (job as any).ai_yoe ?? 'N/A';
  const apply = (job as any).ai_direct_apply ?? 'N/A';
  const facts = (job as any).ai_facts as Record<string, any> | undefined;

  const scoreNum = typeof score === 'number' ? score : 0;
  const categoryLabel = category ? CATEGORY_MAP[category]?.label ?? category : `${score}/10`;
  const emoji = category
    ? (scoreNum >= 5 ? '🟢' : scoreNum >= 4 ? '🟡' : scoreNum >= 2 ? '🟠' : '🔴')
    : (scoreNum >= 9 ? '🟢' : scoreNum >= 7 ? '🟡' : scoreNum >= 4 ? '🟠' : '🔴');

  const lines = [
    `${String(index + 1).padStart(2)}. ${emoji} [${categoryLabel}] ${title} @ ${company}`,
    `    Reason: ${reason}`,
    `    Matched: ${matched}`,
    `    Missing: ${missing}`,
    `    YOE:     ${yoe}`,
    `    Apply:   ${apply}`,
    `    Loc:     ${job.location ?? 'N/A'}`,
  ];

  if (facts) {
    const required = (facts.required_skills ?? []).join(', ') || '—';
    const preferred = (facts.preferred_skills ?? []).join(', ') || '—';
    const minYoe = facts.min_required_yoe ?? '—';
    const maxYoe = facts.max_required_yoe ?? '—';
    const domain = facts.job_domain ?? '—';
    const domainMatch = facts.domain_matches_candidate ? 'yes' : 'no';
    lines.push(`    Facts:   domain=${domain} | domain_match=${domainMatch}`);
    lines.push(`    Required: ${required}`);
    lines.push(`    Preferred: ${preferred}`);
    lines.push(`    YOE range: ${minYoe}-${maxYoe}`);
  }

  lines.push('');
  return lines.join('\n');
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
  console.log(`  Jobs sent to LLM:    ${preFilterTotal - yoeRejectedCount} / ${preFilterTotal}`);
  console.log(`  Filter cost saved:  ~$${(cost / Math.max(1, preFilterTotal - yoeRejectedCount) * yoeRejectedCount).toFixed(6)} (${yoeRejectedCount} YOE-rejected jobs)`);
  console.log('═══════════════════════════════════════');
}

// ── Main ────────────────────────────────────────────────────────────────────

function parseModelFlag(): string {
  const idx = process.argv.indexOf('--model');
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
  return process.env.MODEL_ID ?? 'deepseek/deepseek-v4-flash';
}

function parseBatchSizeFlag(): number {
  const idx = process.argv.indexOf('--batch-size');
  if (idx !== -1 && process.argv[idx + 1]) {
    const n = parseInt(process.argv[idx + 1], 10);
    if (!Number.isNaN(n) && n > 0) return n;
    console.error(`Invalid --batch-size: ${process.argv[idx + 1]}`);
    process.exit(1);
  }
  return BATCH_SIZE;
}

function parseExtractOnlyFlag(): boolean {
  return process.argv.includes('--extract-only');
}

function parseJobsFlag(): Job[] | null {
  const idx = process.argv.indexOf('--jobs');
  if (idx === -1 || !process.argv[idx + 1]) return null;
  const filePath = process.argv[idx + 1];
  if (!fs.existsSync(filePath)) {
    console.error(`Jobs file not found: ${filePath}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Job[];
}

function printFacts(facts: JobFitFacts[], jobs: Job[]): void {
  console.log('EXTRACTED FACTS (raw LLM output):');
  console.log('─────────────────────────────────────');
  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const f = facts[i];
    console.log(`${String(i + 1).padStart(2)}. ${job.title ?? 'Unknown'} @ ${job.companyName ?? 'Unknown'}`);
    console.log(`    domain:              ${f.job_domain ?? '—'}`);
    console.log(`    domain_match:        ${f.domain_matches_candidate}`);
    console.log(`    required_skills:     [${f.required_skills.join(', ') || '—'}]`);
    console.log(`    preferred_skills:    [${f.preferred_skills.join(', ') || '—'}]`);
    console.log(`    matched_required:    [${f.candidate_matched_required_skills.join(', ') || '—'}]`);
    console.log(`    matched_preferred:   [${f.candidate_matched_preferred_skills.join(', ') || '—'}]`);
    console.log(`    missing_required:    [${f.candidate_missing_required_skills.join(', ') || '—'}]`);
    console.log(`    missing_preferred:   [${f.candidate_missing_preferred_skills.join(', ') || '—'}]`);
    console.log(`    min_yoe:             ${f.min_required_yoe ?? '—'}`);
    console.log(`    max_yoe:             ${f.max_required_yoe ?? '—'}`);
    console.log(`    location:            ${f.job_location ?? '—'}`);
    console.log(`    direct_apply:        ${f.direct_apply ?? '—'}`);
    console.log('');
  }
}

async function runPipeline(
  jobs: Job[],
  context: UserPromptContext,
  batchSize: number,
  modelId: string,
): Promise<{ matched: EnrichedJob[]; rejected: EnrichedJob[]; usage: TokenUsage }> {
  // Step 1: extraction
  const { facts, usage } = await extractJobFitFactsBatch(jobs, context, batchSize, 0, 1, modelId);
  // Step 2: deterministic evaluation
  const { evaluateJobFit } = await import('../src/services/fit_evaluator');
  const matched: EnrichedJob[] = [];
  const rejected: EnrichedJob[] = [];
  for (let i = 0; i < jobs.length; i++) {
    const evalResult = evaluateJobFit(facts[i], context);
    const pass = ['strong_match', 'minor_gaps'].includes(evalResult.category);
    const enriched: EnrichedJob = {
      ...jobs[i],
      status: pass ? 'matched' : 'rejected',
      ai_category: evalResult.category,
      ai_score: evalResult.score,
      ai_reason: evalResult.reason,
      ai_matched_skills: evalResult.matched_skills,
      ai_missing_skills: evalResult.missing_skills,
      ai_job_location: evalResult.job_location,
      ai_yoe: evalResult.years_of_experience,
      ai_direct_apply: evalResult.direct_apply,
      ai_facts: facts[i],
    };
    (pass ? matched : rejected).push(enriched);
  }
  return { matched, rejected, usage };
}

async function main() {
  const prefilterOnly = process.argv.includes('--prefilter-only');
  const extractOnly = parseExtractOnlyFlag();
  const modelId = parseModelFlag();
  const batchSize = parseBatchSizeFlag();
  const externalJobs = parseJobsFlag();

  console.log('═══════════════════════════════════════');
  console.log('OPENROUTER BATCH TEST — Extraction + Evaluator');
  console.log(`Model: ${modelId}`);
  if (extractOnly) console.log('(extract-only mode — prints raw LLM facts, no evaluator)');
  if (prefilterOnly) console.log('(prefilter-only mode — no LLM calls)');
  console.log('═══════════════════════════════════════');
  console.log('');

  const resume = readResume();
  console.log(`Resume: ${resume.length} chars  |  Candidate: ${CANDIDATE_YOE} yr exp`);
  console.log('');

  const testJobs: Job[] = externalJobs ?? createTestJobs();

  const { passToLLM, yoeRejected } = yoePreFilter(testJobs, CANDIDATE_YOE);
  printPreFilterSummary(testJobs as AugmentedJob[], passToLLM as AugmentedJob[], yoeRejected as AugmentedJob[]);

  if (prefilterOnly) {
    console.log('Prefilter-only mode done. No LLM calls made.');
    console.log('');
    return;
  }

  if (!process.env.LLM_API_KEY) {
    console.error('Missing LLM_API_KEY. Set it via:');
    console.error('  export LLM_API_KEY="sk-xxx"');
    console.error('Or run prefilter-only:');
    console.error('  npx tsx scripts/test_deepseek_batch.ts --prefilter-only');
    process.exit(1);
  }

  const context = buildCandidateContext(resume);

  console.log(`Sending ${passToLLM.length} jobs to OpenRouter (${modelId}) in batches of ${batchSize}...`);
  console.log('');

  const startTime = Date.now();
  let matched: EnrichedJob[] = [];
  let rejected: EnrichedJob[] = [];
  let usage: TokenUsage;

  if (extractOnly) {
    const { facts, usage: u } = await extractJobFitFactsBatch(passToLLM, context, batchSize, 0, 1, modelId);
    usage = u;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    printFacts(facts, passToLLM);
    console.log(`OpenRouter extraction done in ${elapsed}s.`);
    printUsageSummary(usage, testJobs.length, yoeRejected.length);
    return;
  }

  const result = await runPipeline(passToLLM, context, batchSize, modelId);
  matched = result.matched;
  rejected = result.rejected;
  usage = result.usage;
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`OpenRouter done in ${elapsed}s.  Matched: ${matched.length}  |  LLM-Rejected: ${rejected.length}`);
  console.log('');

  const allLLMResults = [...matched, ...rejected];
  const jobOrder = new Map(passToLLM.map((j, i) => [j.title, i]));
  allLLMResults.sort((a, b) => (jobOrder.get(a.title!) ?? 99) - (jobOrder.get(b.title!) ?? 99));

  console.log('LLM RESULTS:');
  console.log('─────────────────────────────────────');
  for (let i = 0; i < allLLMResults.length; i++) {
    console.log(formatJobResult(allLLMResults[i], i));
  }

  console.log(`YOE-Rejected (no LLM cost): ${yoeRejected.length} jobs`);
  for (const job of yoeRejected) console.log(`  ✗ ${job.title}`);
  console.log('');

  printUsageSummary(usage, testJobs.length, yoeRejected.length);
}

main().catch((err) => { console.error('Fatal error:', err); process.exit(1); });
