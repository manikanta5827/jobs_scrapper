/**
 * llm.ts
 * LLM helper functions for relevance checking and keyword generation.
 * Migrated to Vercel AI SDK for robust JSON parsing.
 * Uses OpenRouter with DeepInfra provider for deepseek/deepseek-v4-flash.
 */
import type { Job, EnrichedJob, JobFitFacts, BatchResult, TokenUsage, UserPromptContext } from "./types";
import { setTimeout as sleep } from "node:timers/promises";
import { generateObject } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { z } from 'zod';
import { wrapModelWithTelemetry } from './telemetry';
import { MATCHED_CATEGORY_SET } from './constants';
import { evaluateJobFit } from './fit_evaluator';

// Disable verbose AI SDK compatibility warnings in production logs
(globalThis as any).AI_SDK_LOG_WARNINGS = false;

export class FatalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FatalError";
  }
}

// OpenRouter returns the exact provider-reported cost in providerMetadata.openrouter.usage.cost.
// We surface it on TokenUsage.actualCostUsd; no hardcoded pricing table is needed.
export function calculateCostUsd(usage: TokenUsage): number {
  return usage.actualCostUsd ?? 0;
}

// Core helper to execute the LLM via Vercel AI SDK + OpenRouter and parse token usage reliably
export async function executellmCall<T>(
  schema: z.ZodType<T>,
  prompt: string,
  systemPrompt?: string,
  temperature?: number,
  telemetryOptions?: { functionId?: string; metadata?: Record<string, string> },
  modelId?: string,
): Promise<{ object: T; usage: TokenUsage }> {
  if (!process.env.LLM_API_KEY) {
    throw new FatalError("Missing LLM_API_KEY");
  }

  const openrouter = createOpenRouter({
    apiKey: process.env.LLM_API_KEY,
  });

  const model = wrapModelWithTelemetry(
    openrouter(modelId ?? 'deepseek/deepseek-v4-flash', {
      extraBody: {
        provider: {
          order: ['deepinfra'],
        }
      }
    }),
    {
      functionId: telemetryOptions?.functionId ?? 'llm-call',
      metadata: telemetryOptions?.metadata ?? {},
    }
  );

  const { object, usage: apiUsage, providerMetadata } = await generateObject({
    model,
    system: systemPrompt,
    prompt: prompt,
    schema: schema,
    maxRetries: 3,
    temperature: temperature,
  });

  const anyUsage = apiUsage as Record<string, any>;
  const inputTokens = anyUsage.inputTokens ?? 0;
  const inputTokenDetails = anyUsage.inputTokenDetails ?? {};
  const cachedTokens = inputTokenDetails.cacheReadTokens ?? 0;
  const outputTokens = anyUsage.outputTokens ?? 0;
  const openrouterCost = (providerMetadata as Record<string, any> | undefined)?.openrouter?.usage?.cost;

  return {
    object,
    usage: {
      promptCacheHitTokens: cachedTokens,
      promptCacheMissTokens: inputTokens - cachedTokens,
      completionTokens: outputTokens,
      actualCostUsd: typeof openrouterCost === 'number' ? openrouterCost : undefined,
    }
  };
}

function normalizeCandidateContext(context: UserPromptContext | string): UserPromptContext {
  if (typeof context === 'string') {
    return { resumeText: context };
  }
  return context;
}

export function buildSystemPrompt(context: UserPromptContext): string {
  const expYears = Math.ceil(context.experienceYears ?? 0);
  const skills = context.knownSkills?.length ? context.knownSkills.join(', ') : 'See resume';
  const profileSummary = context.candidateSummary?.trim()
    ? context.candidateSummary.trim()
    : (context.resumeText ?? '').slice(0, 2000);

  return `You are a structured-fact extractor for job-fit evaluation. For each job listing, extract only facts. Do NOT decide matched / rejected.

## CANDIDATE PROFILE
- Total experience: ${expYears} year(s)
- Primary domain: ${context.primaryDomain ?? 'Not specified'}
- Known skills: ${skills}
- Profile summary: ${profileSummary}
${context.targetLocations ? `- Preferred locations: ${context.targetLocations}\n` : ''}${context.employmentType ? `- Preferred employment: ${context.employmentType}\n` : ''}

## EXTRACTION RULES
1. job_domain: functional domain of the role (e.g. "Backend Engineering", "Frontend Development", "DevOps", "QA", "Data Engineering", "Embedded Systems", "Mobile", "Product Management").
2. min_required_yoe / max_required_yoe: extract only explicitly stated years of experience. Use numbers. If a range is given, return both; if only one endpoint, return the other as null.
3. required_skills: list only technical skills, tools, languages, frameworks that are explicitly required to do the job. Do NOT infer skills from the title. Do NOT include preferred/nice-to-have skills here.
4. preferred_skills: list explicitly stated nice-to-have skills. These are informational only.
5. candidate_matched_skills: subset of required_skills that the candidate demonstrably has (based on the profile above).
6. candidate_missing_skills: required_skills that are NOT in candidate_matched_skills.
7. job_has_no_explicit_skills: true if the JD does not list any specific technical skills/tools.
8. domain_matches_candidate: true if the job_domain is aligned with the candidate's primary domain and background.
9. job_location: the location string. Return null if "remote", "anywhere", or not specified.
10. direct_apply: the direct apply URL if visible in the job data; otherwise null.

## OUTPUT FORMAT
Return ONLY valid JSON. No markdown outside JSON.

{
  "results": [
    {
      "id": number,
      "job_domain": string | null,
      "min_required_yoe": number | null,
      "max_required_yoe": number | null,
      "required_skills": string[],
      "preferred_skills": string[],
      "candidate_matched_skills": string[],
      "candidate_missing_skills": string[],
      "job_has_no_explicit_skills": boolean,
      "domain_matches_candidate": boolean,
      "job_location": string | null,
      "direct_apply": string | null
    }
  ]
}`;
}

const jobFitFactsSchema = z.object({
  id: z.coerce.number(),
  job_domain: z.string().nullable().catch(null),
  min_required_yoe: z.number().nullable().catch(null),
  max_required_yoe: z.number().nullable().catch(null),
  required_skills: z.array(z.string()).catch([]),
  preferred_skills: z.array(z.string()).catch([]),
  candidate_matched_skills: z.array(z.string()).catch([]),
  candidate_missing_skills: z.array(z.string()).catch([]),
  job_has_no_explicit_skills: z.boolean().catch(false),
  domain_matches_candidate: z.boolean().catch(false),
  job_location: z.string().nullable().catch(null),
  direct_apply: z.string().nullable().catch(null),
});

const batchFactsResponseSchema = z.object({
  results: z.array(jobFitFactsSchema),
});

// Extract structured job facts for every job via the LLM, without evaluating fit.
export async function extractJobFitFactsBatch(
  jobs: Job[],
  candidateContext: UserPromptContext | string,
  batchSize: number = 2,  // How many jobs per single LLM API call (e.g. 2 jobs in 1 prompt)
  delayMs: number = 1000,   // Delay between parallel chunks to prevent LLM rate limiting
  concurrency: number = 3,  // How many batches (LLM API calls) to execute simultaneously in parallel
  modelId?: string,
): Promise<{ facts: JobFitFacts[]; usage: TokenUsage }> {
  const candidateCtx = normalizeCandidateContext(candidateContext);
  const usage: TokenUsage = { promptCacheHitTokens: 0, promptCacheMissTokens: 0, completionTokens: 0, actualCostUsd: 0 };
  const systemPrompt = buildSystemPrompt(candidateCtx);
  const allFacts: JobFitFacts[] = new Array(jobs.length);

  // STEP 1: Split total jobs into smaller batches (e.g., 149 jobs -> 15 batches of 10 jobs each)
  const batches: Job[][] = [];
  for (let i = 0; i < jobs.length; i += batchSize) {
    batches.push(jobs.slice(i, i + batchSize));
  }

  const totalBatches = batches.length;

  // STEP 2: Process batches in controlled concurrency groups (chunks)
  // Instead of running 1 batch at a time (sequential) or all 15 at once (rate limit/memory risk),
  // we pick `concurrency` (e.g. 3) batches at a time and run them in parallel.
  for (let i = 0; i < batches.length; i += concurrency) {
    // Slice out the current chunk of up to `concurrency` batches (e.g., batches 1, 2, and 3)
    const chunk = batches.slice(i, i + concurrency);

    // `Promise.all` fires off API calls for all batches in `chunk` simultaneously and waits until all complete.
    await Promise.all(
      chunk.map(async (batch, indexWithinChunk) => {
        // Calculate 1-based index for logging (e.g. Batch 1, Batch 2...)
        const batchNum = i + indexWithinChunk + 1;
        console.log(`OpenRouter extraction batch ${batchNum}/${totalBatches} (${batch.length} jobs)`);

        let results = new Map<number, JobFitFacts>();
        let attempt = 0;
        const MAX_BATCH_RETRIES = 3;
        let lastError: unknown = null;

        while (attempt < MAX_BATCH_RETRIES) {
          attempt++;
          try {
            // Prepare lightweight payload for each job in this batch, attaching a temporary numeric ID (0..4)
            const payload = batch.map((job, id) => ({ id, ...prepareJobPayload(job) }));
            const userMessage = `Job Listings (JSON array, ${batch.length} jobs):\n-------------------\n${JSON.stringify(payload, null, 2)}\n\nExtract structured facts per the system rules. Do not decide matched / rejected.`;

            const res = await executellmCall(
              batchFactsResponseSchema,
              userMessage,
              systemPrompt,
              undefined,
              {
                functionId: 'job-fit-extraction-batch',
                metadata: { batch_number: String(batchNum), batch_size: String(batch.length) }
              },
              modelId,
            );

            // Track cumulative token usage and actual cost across all parallel calls
            usage.promptCacheHitTokens += res.usage.promptCacheHitTokens;
            usage.promptCacheMissTokens += res.usage.promptCacheMissTokens;
            usage.completionTokens += res.usage.completionTokens;
            usage.actualCostUsd = (usage.actualCostUsd ?? 0) + (res.usage.actualCostUsd ?? 0);

            // Store AI evaluation results keyed by job ID (0..4)
            for (const item of res.object.results) {
              results.set(item.id, item as JobFitFacts);
            }
            lastError = null;
            break; // Success! Exit retry loop
          } catch (err) {
            if (err instanceof FatalError) throw err;
            lastError = err;
            const reason = err instanceof Error ? err.message : String(err);
            console.warn(`[LLM Retry] Batch ${batchNum}/${totalBatches} (attempt ${attempt}/${MAX_BATCH_RETRIES}) failed: ${reason}`);
            if (attempt < MAX_BATCH_RETRIES) {
              await sleep(1500 * attempt); // Backoff 1.5s, 3s before retrying
            }
          }
        }

        if (lastError) {
          console.error(`[LLM Error] Batch ${batchNum}/${totalBatches} failed after ${MAX_BATCH_RETRIES} attempts. Retrying jobs individually as fallback...`);
          for (let j = 0; j < batch.length; j++) {
            if (!results.has(j)) {
              try {
                const singlePayload = [{ id: j, ...prepareJobPayload(batch[j]) }];
                const singleMsg = `Job Listings (JSON array, 1 job):\n-------------------\n${JSON.stringify(singlePayload, null, 2)}\n\nExtract structured facts per the system rules. Do not decide matched / rejected.`;
                const singleRes = await executellmCall(
                  batchFactsResponseSchema,
                  singleMsg,
                  systemPrompt,
                  undefined,
                  {
                    functionId: 'job-fit-extraction-fallback',
                    metadata: { job_title: batch[j].title ?? '' }
                  },
                  modelId,
                );
                usage.promptCacheHitTokens += singleRes.usage.promptCacheHitTokens;
                usage.promptCacheMissTokens += singleRes.usage.promptCacheMissTokens;
                usage.completionTokens += singleRes.usage.completionTokens;
                usage.actualCostUsd = (usage.actualCostUsd ?? 0) + (singleRes.usage.actualCostUsd ?? 0);
                if (singleRes.object.results && singleRes.object.results.length > 0) {
                  results.set(j, singleRes.object.results[0] as JobFitFacts);
                  console.log(`  ✓ Fallback individual extraction succeeded for "${batch[j].title}"`);
                }
              } catch (singleErr: unknown) {
                const singleErrMsg = singleErr instanceof Error ? singleErr.message : String(singleErr);
                console.error(`  ✗ Fallback individual extraction failed for "${batch[j].title}": ${singleErrMsg}`);
                results.set(j, {
                  job_domain: null,
                  min_required_yoe: null,
                  max_required_yoe: null,
                  required_skills: [],
                  preferred_skills: [],
                  candidate_matched_skills: [],
                  candidate_missing_skills: [],
                  job_has_no_explicit_skills: false,
                  domain_matches_candidate: false,
                  job_location: null,
                  direct_apply: null,
                });
              }
            }
          }
        }

        // STEP 3: Map AI evaluations back to original job objects and classify as matched vs rejected
        for (let j = 0; j < batch.length; j++) {
          const globalIndex = (i + indexWithinChunk) * batchSize + j;
          const facts = results.get(j);
          if (facts) {
            allFacts[globalIndex] = facts;
          } else {
            console.error(`Job missing from LLM response: "${batch[j].title}"`);
            allFacts[globalIndex] = {
              job_domain: null,
              min_required_yoe: null,
              max_required_yoe: null,
              required_skills: [],
              preferred_skills: [],
              candidate_matched_skills: [],
              candidate_missing_skills: [],
              job_has_no_explicit_skills: false,
              domain_matches_candidate: false,
              job_location: null,
              direct_apply: null,
            };
          }
        }
      })
    );

    // Pause briefly between chunk groups to avoid hitting provider Rate Limits (RPM)
    if (i + concurrency < batches.length && delayMs > 0) {
      await sleep(delayMs);
    }
  }

  return { facts: allFacts, usage };
}

// Full pipeline: extract facts, then run deterministic fit evaluation.
export async function checkRelevanceBatch(
  jobs: Job[],
  candidateContext: UserPromptContext | string,
  batchSize: number = 5,
  delayMs: number = 1000,
  concurrency: number = 3,
  modelId?: string,
): Promise<BatchResult> {
  const candidateCtx = normalizeCandidateContext(candidateContext);
  const { facts, usage } = await extractJobFitFactsBatch(jobs, candidateCtx, batchSize, delayMs, concurrency, modelId);

  const matched: EnrichedJob[] = [];
  const rejected: EnrichedJob[] = [];

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const fact = facts[i];
    const evalResult = evaluateJobFit(fact, candidateCtx);
    const category = evalResult.category;
    const isGoodMatch = MATCHED_CATEGORY_SET.has(category);
    const enriched: EnrichedJob = {
      ...job,
      status: isGoodMatch ? "matched" : "rejected",
      ai_category: category,
      ai_score: evalResult.score,
      ai_reason: evalResult.reason,
      ai_matched_skills: evalResult.matched_skills,
      ai_missing_skills: evalResult.missing_skills,
      ai_job_location: evalResult.job_location,
      ai_yoe: evalResult.years_of_experience,
      ai_direct_apply: evalResult.direct_apply,
      ai_facts: fact,
    };
    isGoodMatch ? matched.push(enriched) : rejected.push(enriched);
  }

  return { matched, rejected, usage };
}

function prepareJobPayload(job: Job) {
  return {
    title: job.title,
    location: job.location,
    seniorityLevel: job.seniorityLevel,
    employmentType: job.employmentType,
    jobFunction: job.jobFunction,
    industries: job.industries,
    salary: job.salary,
    descriptionText: (job.descriptionText ?? ""),
    benefits: job.benefits,
    extracted_yoe: job.extractedYoeText ?? null,
  };
}


const analyzeResponseSchema = z.object({
  candidateName: z.string().optional(),
  candidateEmail: z.string().optional(),
  candidatePhone: z.string().optional(),
  experienceYears: z.number().optional(),
  primaryDomain: z.string(),
  candidateSummary: z.string(),
  knownSkills: z.array(z.string()),
  education: z.array(z.string()),
  projects: z.array(z.object({
    project_title: z.string(),
    project_description: z.string(),
  })),
  certifications: z.array(z.string()),
  keyHighlights: z.array(z.string()),
  suggestedJobTitles: z.array(z.string()),
  excludeTitleKeywords: z.array(z.string()),
});

// Single synchronous Onboarding AI call to parse resume into structured JSON and extract exclude keywords
export async function analyzeResumeWithLLM(resumeText: string) {
  const prompt = `You are an expert HR Auditor and Technical Recruiter analyzing a candidate's plain text resume.
Extract a comprehensive structured JSON object describing the candidate's profile and job search parameters.

MANDATORY FIELDS TO RETURN:
1. "candidateName": Candidate's full name as it appears on the resume (leave empty string if not found).
2. "candidateEmail": Candidate's email address from the resume (leave empty string if not found).
3. "candidatePhone": Candidate's phone/mobile number from the resume (leave empty string if not found).
4. "experienceYears": Integer estimating candidate's total years of professional experience (0 for fresher/student, 1 for 1 year, 2 for 2 years, 3 for 3 years, etc.).
5. "primaryDomain": Candidate's primary functional field (e.g. "QA & Software Testing", "Backend & Cloud Engineering", "Frontend Development", "Product Management", "Data Analytics").
6. "candidateSummary": A concise 2-sentence summary of the candidate's core identity, capabilities, and background.
7. "knownSkills": String array of candidate's technical & professional skills, tools, languages, and frameworks.
8. "education": String array of academic degrees and institutions (e.g. ["B.Tech Computer Science (2024)"]).
9. "projects": Array of objects [{ "project_title": "...", "project_description": "..." }] detailing candidate's key projects.
10. "certifications": String array of certifications earned (e.g. ["AWS Certified Developer"]).
11. "keyHighlights": Array of 2-3 key accomplishments/highlights.
12. "suggestedJobTitles": String array of 3-5 target job titles recommended for this candidate (e.g. ["Junior Backend Developer", "DevOps Engineer"]).
13. "excludeTitleKeywords": String array of titles, level codes (Senior, Lead, SDE3, Principal, Manager), and non-matching domains to reject in job searches, send min of 10-15 job titles keywords that are not relavant to user profile.

CANDIDATE RESUME:
${resumeText.slice(0, 10000)}`;

  try {
    const res = await executellmCall(
      analyzeResponseSchema,
      prompt,
      undefined,
      0.1,
      { functionId: 'analyze-resume' }
    );
    return res.object;
  } catch (err) {
    console.error("Error analyzing resume with LLM:", err);
    throw err;
  }
}

// ATS resume structured output schema — LLM only handles mutable resume content
const atsResumeSchema = z.object({
  contactDetails: z.record(z.string(), z.string()).describe(
    "Key-value pairs of contact info extracted from resume (e.g. Phone, LinkedIn, Location, GitHub, Portfolio). Keys are human-readable labels. Do NOT include Name or Email — those are handled separately."
  ),
  summary: z.string().describe("ATS-tailored professional summary incorporating JD keywords"),
  experience: z.array(z.object({
    title: z.string(),
    company: z.string(),
    dates: z.string(),
    bullets: z.array(z.string()),
  })).describe("Work experience with JD-tailored bullet points"),
  skills: z.array(z.string()).describe("Skills from resume, prioritized by JD relevance"),
  education: z.array(z.object({
    degree: z.string(),
    institution: z.string(),
    dates: z.string(),
  })).optional(),
  projects: z.array(z.object({
    name: z.string(),
    description: z.string(),
    technologies: z.array(z.string()).optional(),
  })).optional(),
  changes_made: z.array(z.string()).describe("Specific changes applied to tailor resume to this JD"),
  ats_keywords_used: z.array(z.string()).describe("JD keywords successfully incorporated into resume"),
});

type AtsResume = z.infer<typeof atsResumeSchema>;

function convertAtsResumeToMarkdown(
  resume: AtsResume,
  userName: string,
  userEmail: string,
): string {
  const lines: string[] = [];

  lines.push(`# ${userName}`);
  const contactBits: string[] = [userEmail];
  for (const [key, value] of Object.entries(resume.contactDetails)) {
    contactBits.push(`${key}: ${value}`);
  }
  lines.push(contactBits.join(' | '));

  lines.push(`## Summary`);
  lines.push(resume.summary);

  lines.push(`## Skills`);
  lines.push(resume.skills.join(', '));

  if (resume.experience.length > 0) {
    lines.push(`## Work Experience`);
    for (const exp of resume.experience) {
      lines.push(`### ${exp.title} — ${exp.company} (${exp.dates})`);
      for (const bullet of exp.bullets) lines.push(`- ${bullet}`);
    }
  }

  if (resume.education && resume.education.length > 0) {
    lines.push(`## Education`);
    for (const edu of resume.education) {
      lines.push(`- ${edu.degree}, ${edu.institution} (${edu.dates})`);
    }
  }

  if (resume.projects && resume.projects.length > 0) {
    lines.push(`## Projects`);
    for (const proj of resume.projects) {
      const techs = proj.technologies?.length ? ` — ${proj.technologies.join(', ')}` : '';
      lines.push(`### ${proj.name}${techs}`);
      lines.push(proj.description);
    }
  }

  return lines.join('\n\n');
}

export async function generateAtsResume(
  candidateResumeText: string,
  jobTitle: string,
  companyName: string,
  jobDescription: string,
  matchedSkills: string[] = [],
  userName?: string,
  userEmail?: string,
): Promise<{ resumeMd: string; usage: TokenUsage; changesMade: string[]; keywordsUsed: string[] }> {
  const matchedSkillsHint = matchedSkills.length > 0
    ? `\n- Matched skills the candidate ALREADY HAS (use these as anchor points): ${matchedSkills.join(', ')}`
    : '';

  const systemPrompt = `You are an expert ATS (Applicant Tracking System) resume optimizer. Your task is to TAILOR the candidate's existing resume for a specific job.

### CORE MISSION
Rewrite and reorganize the candidate's resume content to align with the target job description. You MUST produce a noticeably different, tailored resume — NEVER return the original resume verbatim.

### STRICT RULES
1. **TRUTHFULNESS**: NEVER invent companies, job titles, dates, degrees, skills, tools, or metrics that do not exist in the original resume. You may rephrase, reorder, and emphasize, but every factual claim must have a basis in the original resume.
2. **KEYWORD ALIGNMENT**: Extract key skills, tools, and qualifications from the job description. Rewrite bullet points and the summary to naturally incorporate matching keywords that the candidate actually has.${matchedSkillsHint}
3. **PRIORITIZE JD RELEVANCE**: Reorder experience bullets and skills so that JD-relevant items appear first. De-emphasize irrelevant experience — but do not remove it unless it adds zero value.
4. **ATS-FRIENDLY FORMAT**: Use standard section headers, bullet points, no tables/columns/emojis/graphics.
5. **DETECT VERBATIM**: Before outputting, verify the resume is materially different from the original. If the job description has no useful tailoring information, note this in changes_made.`;

  const prompt = `### CANDIDATE ORIGINAL RESUME:
${candidateResumeText.slice(0, 10000)}

### TARGET JOB DESCRIPTION (${jobTitle} at ${companyName}):
${jobDescription.slice(0, 8000)}

### REQUIRED OUTPUT
Return a structured JSON object with the ATS-tailored resume. The "changes_made" field MUST list the specific modifications you made. The "ats_keywords_used" field MUST list JD keywords you incorporated.

CRITICAL: Do NOT return the resume verbatim. Tailor it.`;

  const { object: resume, usage } = await executellmCall(
    atsResumeSchema,
    prompt,
    systemPrompt,
    0.4,
    { functionId: 'generate-ats-resume', metadata: { jobTitle, companyName } },
  );

  const resumeMd = convertAtsResumeToMarkdown(resume, userName || 'Candidate', userEmail || '');

  return {
    resumeMd,
    usage,
    changesMade: resume.changes_made,
    keywordsUsed: resume.ats_keywords_used,
  };
}