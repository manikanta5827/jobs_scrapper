/**
 * deepseek.ts
 * DeepSeek AI helper functions for relevance checking and keyword generation.
 * Migrated to Vercel AI SDK for robust JSON parsing.
 */
import type { Job, EnrichedJob, RelevanceResult, BatchResult, TokenUsage } from "./types";
import { setTimeout as sleep } from "node:timers/promises";
import { generateObject } from 'ai';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { z } from 'zod';
import { aiTelemetry } from './telemetry';

// Disable verbose AI SDK compatibility warnings in production logs
(globalThis as any).AI_SDK_LOG_WARNINGS = false;

export class FatalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FatalError";
  }
}

const MIN_MATCH_SCORE = parseInt(process.env.MIN_MATCH_SCORE ?? "60", 10);

// "deepseek-chat" pricing per 1M tokens (USD)
const PRICE_PER_M_CACHE_HIT_TOKENS = 0.0028;
const PRICE_PER_M_CACHE_MISS_TOKENS = 0.14;
const PRICE_PER_M_OUTPUT_TOKENS = 0.28;

export function calculateCostUsd(usage: TokenUsage): number {
  return (
    (usage.promptCacheHitTokens / 1_000_000) * PRICE_PER_M_CACHE_HIT_TOKENS +
    (usage.promptCacheMissTokens / 1_000_000) * PRICE_PER_M_CACHE_MISS_TOKENS +
    (usage.completionTokens / 1_000_000) * PRICE_PER_M_OUTPUT_TOKENS
  );
}

// Core helper to execute DeepSeek via Vercel AI SDK and parse token usage reliably
export async function executellmCall<T>(
  schema: z.ZodType<T>,
  prompt: string,
  systemPrompt?: string,
  temperature?: number,
  telemetryOptions?: { functionId?: string; metadata?: Record<string, string> }
): Promise<{ object: T; usage: TokenUsage }> {
  if (!process.env.DEEPSEEK_API_KEY) {
    throw new FatalError("Missing DEEPSEEK_API_KEY");
  }

  const deepseek = createDeepSeek({
    apiKey: process.env.DEEPSEEK_API_KEY,
  });

  const { object, usage: apiUsage } = await generateObject({
    model: deepseek('deepseek-v4-flash'),
    system: systemPrompt,
    prompt: prompt,
    schema: schema,
    maxRetries: 3,
    temperature: temperature,
    experimental_telemetry: aiTelemetry(
      telemetryOptions?.functionId ?? 'llm-call',
      telemetryOptions?.metadata ?? {}
    ),
  });

  const anyUsage = apiUsage as Record<string, any>;
  const inputTokens = (anyUsage.promptTokens as number | undefined) ?? apiUsage.inputTokens ?? 0;
  const cachedTokens = (anyUsage.promptTokensDetails as { cachedTokens?: number } | undefined)?.cachedTokens ?? (anyUsage.cachedInputTokens as number | undefined) ?? 0;
  const outputTokens = (anyUsage.completionTokens as number | undefined) ?? apiUsage.outputTokens ?? 0;
  
  return {
    object,
    usage: {
      promptCacheHitTokens: cachedTokens,
      promptCacheMissTokens: inputTokens - cachedTokens,
      completionTokens: outputTokens,
    }
  };
}

export interface UserPromptContext {
  experienceYears?: number | null;
  targetLocations?: string | null;
  employmentType?: string | null;
  resumeText?: string | null;
  primaryDomain?: string | null;
  candidateSummary?: string | null;
  knownSkills?: string[] | null;
  education?: string[] | null;
  projects?: Array<{ project_title: string; project_description: string }> | null;
  certifications?: string[] | null;
  keyHighlights?: string[] | null;
  suggestedJobTitles?: string[] | null;
}

export function buildSystemPrompt(context: UserPromptContext | string): string {
  let user: UserPromptContext;
  if (typeof context === 'string') {
    user = { experienceYears: 0, resumeText: context };
  } else {
    user = context;
  }

  let candidateSection = "";

  if (user.candidateSummary || (user.knownSkills && user.knownSkills.length > 0)) {
    candidateSection += `## CANDIDATE PROFILE SUMMARY\n`;
    if (user.primaryDomain) candidateSection += `- Primary Domain: ${user.primaryDomain}\n`;
    if (user.candidateSummary) candidateSection += `- Core Capability Summary: ${user.candidateSummary}\n`;
    if (user.knownSkills && user.knownSkills.length > 0) {
      candidateSection += `- Known Skills & Tech Stack: ${user.knownSkills.join(', ')}\n`;
    }
    if (user.keyHighlights && user.keyHighlights.length > 0) {
      candidateSection += `- Key Highlights: ${user.keyHighlights.join(' | ')}\n`;
    }
    if (user.projects && user.projects.length > 0) {
      candidateSection += `- Projects:\n`;
      user.projects.forEach(p => {
        candidateSection += `  * ${p.project_title}: ${p.project_description}\n`;
      });
    }
    if (user.education && user.education.length > 0) {
      candidateSection += `- Education: ${user.education.join('; ')}\n`;
    }
    if (user.certifications && user.certifications.length > 0) {
      candidateSection += `- Certifications: ${user.certifications.join('; ')}\n`;
    }
  } else {
    candidateSection += `## CANDIDATE RESUME\n${user.resumeText || ''}\n`;
  }

  let preferencesSection = "";
  if (user.targetLocations) {
    preferencesSection += `- Candidate Preferred Locations: ${user.targetLocations}\n`;
  }
  if (user.employmentType) {
    preferencesSection += `- Candidate Preferred Employment Type: ${user.employmentType}\n`;
  }

  const expYears = user.experienceYears ?? 0;
  const nextExp = expYears + 1;
  const nextExpPlus = expYears + 2;

  const expRule = `- CANDIDATE TOTAL EXPERIENCE: ${expYears} Year(s).
- STRICT MANDATORY SENIORITY GATE (ZERO TOLERANCE): Compare the job's minimum required experience against candidate's experience of ${expYears} year(s).
  * DISQUALIFY IMMEDIATELY (Score = 0): If the job description requires a MINIMUM experience greater than ${expYears} year(s) (e.g. for this candidate: requirements like "${nextExp}+ years", "${nextExp}–${nextExpPlus} years", "${nextExp}-${nextExpPlus + 1} years", "minimum ${nextExp} years", "${nextExpPlus}+ years" MUST BE INSTANTLY REJECTED WITH SCORE = 0).
  * NO STRETCH ROLES, NO FLEXIBILITY: If minimum required experience > ${expYears} year(s) → INSTANT DISQUALIFICATION (Score = 0).
  * ALLOWED SENIORITY: Only jobs where minimum requirement is <= ${expYears} year(s) (e.g. "Fresher", "0-1 years", "${expYears} year(s)", "${expYears}+ year(s)", or unstated).`;

  return `You are an objective, impartial Job-Fit Auditor. Your sole purpose is to evaluate how effectively a candidate's background aligns with a specific job description.

${candidateSection}
${preferencesSection ? `## CANDIDATE TARGET PREFERENCES\n${preferencesSection}\n` : ''}
---

## EVALUATION CRITERIA

### 1. EXPERIENCE LEVEL & SENIORITY GATE
${expRule}

### 2. SKILL ALIGNMENT & GROUNDING
- HARD REJECT: Job explicitly requires mandatory skills/certifications that the candidate clearly lacks.
- SOFT MISS: Nice-to-have or preferred skills the candidate lacks → deduct points only.
- NATURAL ALIGNMENT: Count directly equivalent tools, frameworks, methodologies, or adjacent skill sets as matches.
- STRICT GROUNDING: "matched_skills" MUST ONLY list skills that are explicitly mentioned or required in the job description AND present in the candidate's known skills or resume. NEVER list candidate skills under "matched_skills" if they are absent from the job description text.

### 3. DOMAIN & ROLE RELEVANCE
- Evaluate whether the job's functional domain matches the candidate's background.
- REJECT: Completely unrelated roles that have zero functional overlap with the candidate's experience.

---

## SCORING GUIDE
| Situation | Score Range |
|---|---|
| Excellent match (Core stack + Seniority <= ${expYears} yr + Domain align cleanly) | 85–100 |
| Good match (Solid alignment, 1–2 minor non-critical skill gaps, Seniority <= ${expYears} yr) | 65–84 |
| Decent match (Fair alignment, minor domain pivot, Seniority <= ${expYears} yr) | 45–64 |
| Disqualified (Seniority requirement > ${expYears} yr, missing mandatory core stack, or unrelated domain) | 0 |

Evaluate all jobs strictly and impartially based solely on skill, experience level, and domain fit. Do NOT apply any score boosts for direct apply links or application methods; simply extract application instructions into "direct_apply" if present.

---

## FEW-SHOT EXAMPLES
Each example shows the per-job evaluation logic. In your actual response, wrap each job's result as one item of "results" with its "id" added.

**Example 1 — REJECT (Seniority Disqualification: Required ${nextExp}–${nextExpPlus} years > Candidate ${expYears} year(s))**
Input: { "title": "AI Agent Developer", "descriptionText": "Who We're Looking For: ${nextExp}–${nextExpPlus} years of experience in AI, automation, or backend development. Python, LLMs, LangChain." }
Output: { "score": 0, "reason": "Disqualified: Required ${nextExp}–${nextExpPlus} years of experience exceeds candidate's total experience of ${expYears} year(s).", "matched_skills": ["Python", "LLMs"], "missing_skills": [], "job_location": null, "years_of_experience": "${nextExp}–${nextExpPlus} years", "direct_apply": null }

**Example 2 — MATCH (Skill & Seniority Alignment: Required <= ${expYears} year(s))**
Input: { "title": "Software Engineer (Backend)", "descriptionText": "Required: 0-${expYears} years experience, TypeScript, Node.js, AWS. Direct apply: send CV to jobs@company.com" }
Output: { "score": 90, "reason": "Match — Candidate's ${expYears} year(s) experience and Node.js/AWS/TypeScript stack align cleanly with job requirements.", "matched_skills": ["TypeScript", "Node.js", "AWS"], "missing_skills": [], "job_location": null, "years_of_experience": "0-${expYears} years", "direct_apply": "Send CV to jobs@company.com" }

---

## INPUT FORMAT
You will receive a JSON array of jobs, each with a unique "id" field. Evaluate EVERY job in the array independently, applying the rules above to each one.

## OUTPUT FORMAT
Return ONLY valid JSON. No markdown, no explanation outside the JSON object.

"results" must contain exactly one object per input job, tagged with the matching "id". Order does not matter.`;
}

// ponytail: resilient schema handles nulls, string coercions, and missing arrays from LLM outputs to prevent schema validation crashes
const relevanceResultSchema = z.object({
  id: z.coerce.number(),
  score: z.coerce.number().catch(0),
  reason: z.string().nullish().transform(val => val ?? "No reason provided"),
  matched_skills: z.array(z.string()).nullish().transform(val => val ?? []),
  missing_skills: z.array(z.string()).nullish().transform(val => val ?? []),
  job_location: z.string().nullish().transform(val => val ?? null),
  years_of_experience: z.string().nullish().transform(val => val ?? "Not specified"),
  direct_apply: z.string().nullish().transform(val => val ?? null),
});

const batchResponseSchema = z.object({
  results: z.array(relevanceResultSchema),
});

// ponytail: process batches in parallel chunks of 3 to avoid exceeding Lambda 15min execution limit; upgrade path is worker pool queue if RPM exceeds provider limits.
export async function checkRelevanceBatch(
  jobs: Job[],
  candidateContext: UserPromptContext | string,
  batchSize: number = 5,  // How many jobs per single LLM API call (e.g. 5 jobs in 1 prompt)
  delayMs: number = 1000,   // Delay between parallel chunks to prevent LLM rate limiting
  concurrency: number = 3,  // How many batches (LLM API calls) to execute simultaneously in parallel
): Promise<BatchResult> {
  const matched: EnrichedJob[] = [];
  const rejected: EnrichedJob[] = [];
  const usage: TokenUsage = { promptCacheHitTokens: 0, promptCacheMissTokens: 0, completionTokens: 0 };
  const systemPrompt = buildSystemPrompt(candidateContext);

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
        console.log(`DeepSeek batch ${batchNum}/${totalBatches} (${batch.length} jobs)`);

        let results = new Map<number, RelevanceResult>();
        let attempt = 0;
        const MAX_BATCH_RETRIES = 3;
        let lastError: unknown = null;

        while (attempt < MAX_BATCH_RETRIES) {
          attempt++;
          try {
            // Prepare lightweight payload for each job in this batch, attaching a temporary numeric ID (0..4)
            const payload = batch.map((job, id) => ({ id, ...prepareJobPayload(job) }));
            const userMessage = `Job Listings (JSON array, ${batch.length} jobs):\n-------------------\n${JSON.stringify(payload, null, 2)}\n\nEvaluate each job per the system rules.`;

            // Call DeepSeek LLM for this batch
            const res = await executellmCall(
              batchResponseSchema,
              userMessage,
              systemPrompt,
              undefined,
              {
                functionId: 'job-relevance-batch',
                metadata: { batch_number: String(batchNum), batch_size: String(batch.length) }
              }
            );

            // Track cumulative token usage across all parallel calls
            usage.promptCacheHitTokens += res.usage.promptCacheHitTokens;
            usage.promptCacheMissTokens += res.usage.promptCacheMissTokens;
            usage.completionTokens += res.usage.completionTokens;

            // Store AI evaluation results keyed by job ID (0..4)
            for (const item of res.object.results) {
              results.set(item.id, item as RelevanceResult);
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
                const singleMsg = `Job Listings (JSON array, 1 job):\n-------------------\n${JSON.stringify(singlePayload, null, 2)}\n\nEvaluate each job per the system rules.`;
                const singleRes = await executellmCall(
                  batchResponseSchema,
                  singleMsg,
                  systemPrompt,
                  undefined,
                  {
                    functionId: 'job-relevance-fallback',
                    metadata: { job_title: batch[j].title ?? '' }
                  }
                );
                usage.promptCacheHitTokens += singleRes.usage.promptCacheHitTokens;
                usage.promptCacheMissTokens += singleRes.usage.promptCacheMissTokens;
                usage.completionTokens += singleRes.usage.completionTokens;
                if (singleRes.object.results && singleRes.object.results.length > 0) {
                  results.set(j, singleRes.object.results[0] as RelevanceResult);
                  console.log(`  ✓ Fallback individual check succeeded for "${batch[j].title}"`);
                }
              } catch (singleErr: unknown) {
                const singleErrMsg = singleErr instanceof Error ? singleErr.message : String(singleErr);
                console.error(`  ✗ Fallback individual check failed for "${batch[j].title}": ${singleErrMsg}`);
                results.set(j, {
                  score: 0,
                  reason: `DeepSeek check failed: ${singleErrMsg}`,
                  matched_skills: [],
                  missing_skills: [],
                  job_location: null,
                  years_of_experience: "Not specified",
                  direct_apply: null,
                });
              }
            }
          }
        }

        // STEP 3: Map AI evaluations back to original job objects and classify as matched vs rejected
        for (let j = 0; j < batch.length; j++) {
          const job = batch[j];
          const parsed = results.get(j);

          if (parsed) {
            const isGoodMatch = parsed.score >= MIN_MATCH_SCORE;
            const enriched: EnrichedJob = {
              ...job,
              status: isGoodMatch ? "matched" : "rejected",
              ai_score: parsed.score,
              ai_reason: parsed.reason,
              ai_matched_skills: parsed.matched_skills,
              ai_missing_skills: parsed.missing_skills,
              ai_job_location: parsed.job_location || null,
              ai_yoe: parsed.years_of_experience,
              ai_direct_apply: parsed.direct_apply || null,
            };
            isGoodMatch ? matched.push(enriched) : rejected.push(enriched);
          } else {
            console.error(`Job missing from DeepSeek response: "${job.title}"`);
            rejected.push({
              ...job,
              status: "rejected",
              ai_score: 0,
              ai_reason: "DeepSeek check failed",
              ai_matched_skills: [],
              ai_missing_skills: [],
              ai_direct_apply: null,
            });
          }
        }
      })
    );

    // Pause briefly between chunk groups to avoid hitting provider Rate Limits (RPM)
    if (i + concurrency < batches.length && delayMs > 0) {
      await sleep(delayMs);
    }
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
  };
}


const analyzeResponseSchema = z.object({
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
1. "experienceYears": Integer estimating candidate's total years of professional experience (0 for fresher/student, 1 for 1 year, 2 for 2 years, 3 for 3 years, etc.).
2. "primaryDomain": Candidate's primary functional field (e.g. "QA & Software Testing", "Backend & Cloud Engineering", "Frontend Development", "Product Management", "Data Analytics").
3. "candidateSummary": A concise 2-sentence summary of the candidate's core identity, capabilities, and background.
4. "knownSkills": String array of candidate's technical & professional skills, tools, languages, and frameworks.
5. "education": String array of academic degrees and institutions (e.g. ["B.Tech Computer Science (2024)"]).
6. "projects": Array of objects [{ "project_title": "...", "project_description": "..." }] detailing candidate's key projects.
7. "certifications": String array of certifications earned (e.g. ["AWS Certified Developer"]).
8. "keyHighlights": Array of 2-3 key accomplishments/highlights.
9. "suggestedJobTitles": String array of 3-5 target job titles recommended for this candidate (e.g. ["Junior Backend Developer", "DevOps Engineer"]).
10. "excludeTitleKeywords": String array of titles, level codes (Senior, Lead, SDE3, Principal, Manager), and non-matching domains to reject in job searches.

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