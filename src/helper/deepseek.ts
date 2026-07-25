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
  return `You are a strict job-fit evaluator. Your only job is to determine if a job posting is worth applying to for this specific candidate. Be conservative — it's better to reject a borderline job than to waste the candidate's time.

## CANDIDATE RESUME
${resumeText}

---

### 1. EXPERIENCE LEVEL — STRICT GATE
- ACCEPT: 0, 1, or 1–2 years | "Entry level" | "Junior" | "Fresher" | "Intern"
- REJECT IMMEDIATELY (score: 0): "2+ years", "3+ years", "at least 2 years", "minimum 2 years", or any Senior/Mid-level designation
- If experience requirement is ambiguous or not mentioned → do NOT reject on this criterion alone

### 2. SKILL ALIGNMENT
- HARD REJECT: Job says "must have", "required", "strong knowledge of" a skill the candidate clearly lacks (e.g., "Must have Java" → candidate has no Java)
- SOFT MISS (not a reject): Nice-to-haves or preferred skills the candidate lacks → deduct points only
- NATURAL ALIGNMENT: Count adjacent skills as matches (e.g., "React" asked, candidate has "Next.js/Frontend" → match; "cloud experience" asked, candidate has AWS → match; "CI/CD, Linux, Docker, monitoring, Terraform/IaC" asked for a DevOps/Cloud role, candidate has AWS Lambda Serverless, Docker, Cloudflare Serverless → match as DevOps-adjacent; "LangChain/LangGraph/AutoGen/CrewAI/OpenAI Agents SDK/AI Agent Engineer" asked, candidate has "Vercel AI SDK, MCP, Sub-Agent design, RAG, Prompt Engineering" → match as agentic-AI-adjacent)
- OPTIONAL SKILLS: "Java, Python, or Node.js" → candidate has Node.js → full match

### 3. DOMAIN RELEVANCE
- Must be related to: Backend Development, Cloud/AWS, AI/LLM/Agentic Engineering (LLM apps, AI agents, MCP, RAG, sub-agents), Fullstack, DevOps, or Software Engineering broadly
- REJECT: Completely unrelated fields (e.g., sales, marketing, finance, hardware)

---

## SCORING GUIDE
| Situation | Score |
|---|---|
| Perfect match (stack + level + domain) | 85–100 |
| Good match, 1–2 soft skill gaps | 65–84 |
| Decent match, some stretch required | 45–64 |
| Weak match, major gaps but not disqualifying | 20–44 |
| Hard reject (experience / mandatory skills / domain) | 0 |

**Score Boost**: If the JD contains a direct apply method (Google Form, Typeform, email like "send CV to x@company.com") → boost score by +15 (cap at 100) and extract full instructions into "direct_apply".

---

## FEW-SHOT EXAMPLES
Each example shows the per-job evaluation logic. In your actual response, wrap each job's result as one item of "results" with its "id" added.

**Example 1 — REJECT (experience)**
Input: { "title": "Node.js Developer", "seniorityLevel": "Mid-Senior", "descriptionText": "3+ years of backend experience required..." }
Output: { "score": 0, "reason": "Requires 3+ years experience; candidate is entry-level.", "matched_skills": [], "missing_skills": [], "job_location": null, "years_of_experience": "3+ years", "direct_apply": null }

**Example 2 — REJECT (mandatory missing skill)**
Input: { "title": "Backend Developer", "descriptionText": "Must have strong Java and Spring Boot. AWS is a plus." }
Output: { "score": 15, "reason": "Java and Spring Boot are mandatory but absent from candidate's profile.", "matched_skills": ["AWS"], "missing_skills": ["Java", "Spring Boot"], "job_location": null, "years_of_experience": "not specified", "direct_apply": null }

**Example 3 — MATCH (core stack)**
Input: { "title": "Backend Intern", "seniorityLevel": "Entry level", "descriptionText": "Node.js, AWS Lambda, REST APIs. 0–1 years. Nice to have: Python." }
Output: { "score": 92,"reason": "Strong match — candidate's Node.js and AWS Lambda experience directly aligns. Python is a soft miss only.", "matched_skills": ["Node.js", "AWS Lambda", "REST APIs"], "missing_skills": ["Python (nice-to-have)"], "job_location": null, "years_of_experience": "0–1 years", "direct_apply": null }

**Example 4 — MATCH (direct apply boost)**
Input: { "title": "Junior Backend Developer", "descriptionText": "1–2 years exp, Node.js, SQL. Apply by sending your CV and GitHub to hiring@startup.com" }
Output: { "score": 97,"reason": "Excellent match on stack and experience level. Direct apply path found.", "matched_skills": ["Node.js", "SQL"], "missing_skills": [], "job_location": null, "years_of_experience": "1–2 years", "direct_apply": "Send CV and GitHub profile to hiring@startup.com" }

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
  batchSize: number = 10,
  delayMs: number = 1000,
  concurrency: number = 3,
): Promise<BatchResult> {
  const matched: EnrichedJob[] = [];
  const rejected: EnrichedJob[] = [];
  const usage: TokenUsage = { promptCacheHitTokens: 0, promptCacheMissTokens: 0, completionTokens: 0 };
  const systemPrompt = buildSystemPrompt(resumeText);

  // Group jobs into batches
  const batches: Job[][] = [];
  for (let i = 0; i < jobs.length; i += batchSize) {
    batches.push(jobs.slice(i, i + batchSize));
  }

  const totalBatches = batches.length;

  // Process batches in chunks with controlled concurrency
  for (let i = 0; i < batches.length; i += concurrency) {
    const chunk = batches.slice(i, i + concurrency);

    await Promise.all(
      chunk.map(async (batch, indexWithinChunk) => {
        const batchNum = i + indexWithinChunk + 1;
        console.log(`DeepSeek batch ${batchNum}/${totalBatches} (${batch.length} jobs)`);

        let results = new Map<number, RelevanceResult>();
        try {
          const payload = batch.map((job, id) => ({ id, ...prepareJobPayload(job) }));
          const userMessage = `Job Listings (JSON array, ${batch.length} jobs):\n-------------------\n${JSON.stringify(payload, null, 2)}\n\nEvaluate each job per the system rules.`;

          const res = await executellmCall(
            batchResponseSchema,
            userMessage,
            systemPrompt
          );

          usage.promptCacheHitTokens += res.usage.promptCacheHitTokens;
          usage.promptCacheMissTokens += res.usage.promptCacheMissTokens;
          usage.completionTokens += res.usage.completionTokens;

          for (const item of res.object.results) {
            results.set(item.id, item as RelevanceResult);
          }
        } catch (err) {
          if (err instanceof FatalError) throw err;
          const reason = err instanceof Error ? err.message : String(err);
          console.error(`Batch ${batchNum}/${totalBatches} failed DeepSeek check: ${reason}`);
        }

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

    if (i + concurrency < batches.length && delayMs > 0) {
      await sleep(delayMs);
    }
  }

  return { matched, rejected, usage };
}

function prepareJobPayload(job: Job) {
  return {
    title: job.title,
    companyName: job.companyName,
    companyDescription: job.companyDescription,
    location: job.location,
    seniorityLevel: job.seniorityLevel,
    employmentType: job.employmentType,
    jobFunction: job.jobFunction,
    industries: job.industries,
    salary: job.salary,
    descriptionText: (job.descriptionText ?? "").slice(0, 5000),
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