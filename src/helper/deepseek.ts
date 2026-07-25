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
  temperature?: number
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
  });

  const anyUsage = apiUsage as any;
  const inputTokens = anyUsage.promptTokens ?? apiUsage.inputTokens ?? 0;
  const cachedTokens = anyUsage.promptTokensDetails?.cachedTokens ?? anyUsage.cachedInputTokens ?? 0;
  const outputTokens = anyUsage.completionTokens ?? apiUsage.outputTokens ?? 0;
  
  return {
    object,
    usage: {
      promptCacheHitTokens: cachedTokens,
      promptCacheMissTokens: inputTokens - cachedTokens,
      completionTokens: outputTokens,
    }
  };
}

export function buildSystemPrompt(resumeText: string): string {
  return `You are an objective, impartial Job-Fit Auditor. Your sole purpose is to evaluate how effectively a candidate's background aligns with a specific job description.

## CANDIDATE RESUME
${resumeText}

---

## EVALUATION CRITERIA

### 1. EXPERIENCE LEVEL & SENIORITY
- Determine candidate's experience level (Fresher/Junior, Mid-Level, Senior, Lead, Architect) and total years of experience (YOE) from their resume.
- Compare candidate's experience against job requirement:
  - Alignment within 1–2 years or matching seniority level → Pass.
  - Significant underqualification or overqualification → Deduct points or reject accordingly.
  - If experience requirement is ambiguous or not stated → Do NOT reject on experience alone.

### 2. SKILL ALIGNMENT & GROUNDING
- HARD REJECT: Job explicitly requires mandatory skills/certifications that the candidate clearly lacks.
- SOFT MISS: Nice-to-have or preferred skills the candidate lacks → deduct points only.
- NATURAL ALIGNMENT: Count directly equivalent tools, frameworks, methodologies, or adjacent skill sets as matches.
- STRICT GROUNDING: "matched_skills" MUST ONLY list skills that are explicitly mentioned or required in the job description AND present in the candidate's resume. NEVER list candidate skills under "matched_skills" if they are absent from the job description text.

### 3. DOMAIN & ROLE RELEVANCE
- Evaluate whether the job's functional domain (e.g., QA/Testing, Software Development, Data Science, Product Management, DevOps, System Administration) matches the candidate's background.
- REJECT: Completely unrelated roles that have zero functional overlap with the candidate's experience.

---

## SCORING GUIDE
| Situation | Score Range |
|---|---|
| Excellent match (Core stack/tools + Seniority + Domain align cleanly) | 85–100 |
| Good match (Solid alignment, 1–2 minor skill or experience gaps) | 65–84 |
| Decent match (Fair alignment, stretch role or minor domain pivot) | 45–64 |
| Weak match (Major skill gaps or significant seniority mismatch) | 20–44 |
| Disqualified (Unrelated domain, missing critical mandatory requirements) | 0 |

Evaluate all jobs strictly and impartially based solely on skill, experience level, and domain fit. Do NOT apply any score boosts for direct apply links or application methods; simply extract application instructions into "direct_apply" if present.

---

## FEW-SHOT EXAMPLES
Each example shows the per-job evaluation logic. In your actual response, wrap each job's result as one item of "results" with its "id" added.

**Example 1 — REJECT (Mandatory missing skill / domain mismatch)**
Input: { "title": "Senior QA Automation Engineer", "descriptionText": "Must have 5+ years experience with Selenium, Java, and Cypress." }
Output: { "score": 0, "reason": "Requires Selenium and Java QA automation experience, absent from candidate's profile.", "matched_skills": [], "missing_skills": ["Selenium", "Java"], "job_location": null, "years_of_experience": "5+ years", "direct_apply": null }

**Example 2 — MATCH (Skill & Seniority Alignment)**
Input: { "title": "Software Engineer", "seniorityLevel": "Mid-Senior", "descriptionText": "Required: 2-4 years experience, TypeScript, Node.js, SQL. Direct apply: send CV to jobs@company.com" }
Output: { "score": 88, "reason": "Good match — candidate's TypeScript and Node.js background aligns with required experience level.", "matched_skills": ["TypeScript", "Node.js", "SQL"], "missing_skills": [], "job_location": null, "years_of_experience": "2-4 years", "direct_apply": "Send CV to jobs@company.com" }

---

## INPUT FORMAT
You will receive a JSON array of jobs, each with a unique "id" field. Evaluate EVERY job in the array independently, applying the rules above to each one.

## OUTPUT FORMAT
Return ONLY valid JSON. No markdown, no explanation outside the JSON object.

"results" must contain exactly one object per input job, tagged with the matching "id". Order does not matter.`;
}

const relevanceResultSchema = z.object({
  id: z.number(),
  score: z.number(),
  reason: z.string(),
  matched_skills: z.array(z.string()),
  missing_skills: z.array(z.string()),
  job_location: z.string().nullable().optional(),
  years_of_experience: z.string(),
  direct_apply: z.string().nullable().optional(),
});

const batchResponseSchema = z.object({
  results: z.array(relevanceResultSchema),
});

// ponytail: process batches in parallel chunks of 3 to avoid exceeding Lambda 15min execution limit; upgrade path is worker pool queue if RPM exceeds provider limits.
export async function checkRelevanceBatch(
  jobs: Job[],
  resumeText: string,
  batchSize: number = 5,  // How many jobs per single LLM API call (e.g. 5 jobs in 1 prompt)
  delayMs: number = 1000,   // Delay between parallel chunks to prevent LLM rate limiting
  concurrency: number = 3,  // How many batches (LLM API calls) to execute simultaneously in parallel
): Promise<BatchResult> {
  const matched: EnrichedJob[] = [];
  const rejected: EnrichedJob[] = [];
  const usage: TokenUsage = { promptCacheHitTokens: 0, promptCacheMissTokens: 0, completionTokens: 0 };
  const systemPrompt = buildSystemPrompt(resumeText);

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
        try {
          // Prepare lightweight payload for each job in this batch, attaching a temporary numeric ID (0..9)
          const payload = batch.map((job, id) => ({ id, ...prepareJobPayload(job) }));
          const userMessage = `Job Listings (JSON array, ${batch.length} jobs):\n-------------------\n${JSON.stringify(payload, null, 2)}\n\nEvaluate each job per the system rules.`;

          // Call DeepSeek LLM for this batch
          const res = await executellmCall(
            batchResponseSchema,
            userMessage,
            systemPrompt
          );

          // Track cumulative token usage across all parallel calls
          usage.promptCacheHitTokens += res.usage.promptCacheHitTokens;
          usage.promptCacheMissTokens += res.usage.promptCacheMissTokens;
          usage.completionTokens += res.usage.completionTokens;

          // Store AI evaluation results keyed by job ID (0..9)
          for (const item of res.object.results) {
            results.set(item.id, item as RelevanceResult);
          }
        } catch (err) {
          if (err instanceof FatalError) throw err;
          const reason = err instanceof Error ? err.message : String(err);
          console.error(`Batch ${batchNum}/${totalBatches} failed DeepSeek check: ${reason}`);
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

// Generate a comprehensive list of job title keywords and level codes to drop based on candidate resume
export async function generateExcludeKeywordsWithLLM(
  resumeText: string
): Promise<string[]> {
  const prompt = `You are an expert HR sourcer analyzing a candidate's resume plain text.
Your goal is to extract a comprehensive JSON array "excludeTitleKeywords" containing words, phrases, level codes, and tech stacks that must be REJECTED in job titles for this candidate.

Consider:
1. Seniority & Management Titles: Senior, Sr, Lead, Principal, Architect, Staff, Manager, Director, Head of, VP, Vice President, Founder, Co-Founder, Executive.
2. Numerical Level Codes: SDE2, SDE-2, SDE3, SDE-3, L2, L3, L4, L5, IC2, IC3, IC4, II, III, IV, Engineer 2, Engineer 3.
3. Experience Indicators: 5+ years, 6+ years, 7+ years, 8+ years, 10+ years, 5+ YOE, 10+ YOE.
4. Non-matching Stacks & Specializations: If candidate is a Backend/Cloud engineer, exclude non-backend roles like Frontend, UI/UX, Designer, Mobile, iOS, Android, Flutter, React Native, QA, Tester, Support, IT Helpdesk, Data Scientist, Data Engineer, Hardware, Embedded, Sales.

CANDIDATE RESUME:
${resumeText.slice(0, 4000)}`;

  const fallbackList = [
    "Senior", "Sr.", "Lead", "Principal", "Architect", "Manager", "Staff", "Director", "VP", 
    "Head of", "SDE2", "SDE-2", "SDE3", "SDE-3", "L2", "L3", "L4", "II", "III", "IV", 
    "5+ years", "8+ years", "10+ years"
  ];

  try {
    const res = await executellmCall(
      z.object({ excludeTitleKeywords: z.array(z.string()) }),
      prompt,
      undefined,
      0.1
    );

    const extracted = res.object.excludeTitleKeywords;
    if (!extracted || extracted.length === 0) {
      return fallbackList;
    }

    return extracted.map((s) => String(s).trim()).filter(Boolean);
  } catch (err) {
    console.error("Error parsing LLM exclude keywords output:", err);
    return fallbackList;
  }
}