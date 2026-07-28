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
import { wrapModelWithTelemetry } from './telemetry';
import { MIN_MATCH_SCORE } from './constants';

// Disable verbose AI SDK compatibility warnings in production logs
(globalThis as any).AI_SDK_LOG_WARNINGS = false;

export class FatalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FatalError";
  }
}

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

  const model = wrapModelWithTelemetry(deepseek('deepseek-v4-flash'), {
    functionId: telemetryOptions?.functionId ?? 'llm-call',
    metadata: telemetryOptions?.metadata ?? {},
  });

  const { object, usage: apiUsage } = await generateObject({
    model,
    system: systemPrompt,
    prompt: prompt,
    schema: schema,
    maxRetries: 3,
    temperature: temperature,
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

  const expYears = Math.ceil(user.experienceYears ?? 0);
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

### 2. SKILL ALIGNMENT & GROUNDING (EVALUATE FIRST — SCORE DERIVES FROM THIS)
- MANDATORY: List matched_skills and missing_skills COMPLETELY before assigning score.
- HARD REJECT: Job explicitly requires mandatory skills/certifications that the candidate clearly lacks.
- SOFT MISS: Nice-to-have or preferred skills the candidate lacks → minor score impact only.
- NATURAL ALIGNMENT: Count directly equivalent tools, frameworks, methodologies, or adjacent skill sets as matches.
- STRICT GROUNDING: "matched_skills" MUST ONLY list skills that are explicitly mentioned or required in the job description AND present in the candidate's known skills or resume. NEVER list candidate skills under "matched_skills" if they are absent from the job description text.
- NEVER return matched_skills=[] AND missing_skills=[] for scores > 0. If you give a positive score, you MUST identify at least one skill that matched.

### 3. DOMAIN & ROLE RELEVANCE
- Evaluate whether the job's functional domain matches the candidate's background.
- REJECT: Completely unrelated roles that have zero functional overlap with the candidate's experience.

---

## SCORING GUIDE (0–10 scale)
Derive score from the matched/missing skill ratio after listing skills:

| Score | Meaning | Rule |
|-------|---------|------|
| 0 | DISQUALIFIED | Seniority > ${expYears} yr, missing mandatory core stack, or unrelated domain |
| 1–3 | Weak match | Core skill gap (candidate lacks 3+ required skills or 1+ mandatory skill) |
| 4–6 | Decent match | Partial alignment: some matching skills but notable gaps (1–3 missing) |
| 7–8 | Good match | Most skills align, only 0–2 minor/non-mandatory gaps |
| 9–10 | Excellent match | Near-perfect alignment: all required skills present, domain matches |

Evaluate all jobs strictly and impartially based solely on skill, experience level, and domain fit. Do NOT apply any score boosts for direct apply links or application methods; simply extract application instructions into "direct_apply" if present.

---

## FEW-SHOT EXAMPLES
Each example shows the per-job evaluation logic. In your actual response, wrap each job's result as one item of "results" with its "id" added.

**Example 1 — REJECT (Seniority Disqualification: Required ${nextExp}–${nextExpPlus} years > Candidate ${expYears} year(s))**
Input: { "title": "AI Agent Developer", "descriptionText": "Who We're Looking For: ${nextExp}–${nextExpPlus} years of experience in AI, automation, or backend development. Python, LLMs, LangChain." }
Output: { "score": 0, "reason": "Disqualified: Required ${nextExp}–${nextExpPlus} years of experience exceeds candidate's total experience of ${expYears} year(s).", "matched_skills": ["Python", "LLMs"], "missing_skills": [], "job_location": null, "years_of_experience": "${nextExp}–${nextExpPlus} years", "direct_apply": null }

**Example 2 — MATCH (Skill & Seniority Alignment: Required <= ${expYears} year(s))**
Input: { "title": "Software Engineer (Backend)", "descriptionText": "Required: 0-${expYears} years experience, TypeScript, Node.js, AWS. Direct apply: send CV to jobs@company.com" }
  Output: { "score": 9, "reason": "Match — Candidate's ${expYears} year(s) experience and Node.js/AWS/TypeScript stack align cleanly with job requirements.", "matched_skills": ["TypeScript", "Node.js", "AWS"], "missing_skills": [], "job_location": null, "years_of_experience": "0-${expYears} years", "direct_apply": "Send CV to jobs@company.com" }

---

## INPUT FORMAT
You will receive a JSON array of jobs, each with a unique "id" field. Evaluate EVERY job in the array independently, applying the rules above to each one.

If a job object has a non-null "extracted_yoe" field, it contains the raw YOE text pre-extracted from the job description (e.g. "2-4 years of experience", "minimum 3 years of relevant experience"). Use it as a strong hint for the "years_of_experience" output field — verify against descriptionText, and correct it only if it clearly contradicts the job description content.

## OUTPUT FORMAT
Return ONLY valid JSON matching the schema. No markdown outside JSON.

"results" must contain exactly one object per input job, tagged with the matching "id".
Every item in "results" MUST include ALL fields listed below:

For DISQUALIFIED jobs (Score = 0):
- "id": number
- "score": 0
- "reason": string — explain WHY rejected (seniority gate / missing mandatory skill / unrelated domain)
- "years_of_experience": string — extract from JD if present, "Not specified" otherwise
- "matched_skills": [] (empty — no need to enumerate for rejected jobs)
- "missing_skills": [] (empty — no need to enumerate for rejected jobs)
- "job_location": null
- "direct_apply": null

For NON-DISQUALIFIED jobs (Score > 0):
- "id": number
- "score": number (0-10, per scoring guide)
- "reason": string (explanation of score)
- "matched_skills": array of strings (skills candidate has that job requires; return [] if none)
- "missing_skills": array of strings (skills job requires that candidate lacks; return [] if none)
- "job_location": string or null
- "years_of_experience": string (e.g. "2-4 years" or "Not specified")
- "direct_apply": string or null (email or direct URL if present)
`;
}

// Hardened schema forcing LLM to always emit matched_skills, missing_skills, reason, and YOE
const relevanceResultSchema = z.object({
  id: z.coerce.number(),
  score: z.coerce.number().catch(0),
  reason: z.string().catch("No reason provided"),
  matched_skills: z.array(z.string()).catch([]),
  missing_skills: z.array(z.string()).catch([]),
  job_location: z.string().nullable().catch(null),
  years_of_experience: z.string().catch("Not specified"),
  direct_apply: z.string().nullable().catch(null),
});

const batchResponseSchema = z.object({
  results: z.array(relevanceResultSchema),
});

// ponytail: process batches in parallel chunks of 3 to avoid exceeding Lambda 15min execution limit; upgrade path is worker pool queue if RPM exceeds provider limits.
export async function checkRelevanceBatch(
  jobs: Job[],
  candidateContext: UserPromptContext | string,
  batchSize: number = 2,  // How many jobs per single LLM API call (e.g. 2 jobs in 1 prompt)
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
  if (!process.env.DEEPSEEK_API_KEY) {
    throw new FatalError("Missing DEEPSEEK_API_KEY");
  }

  const deepseek = createDeepSeek({
    apiKey: process.env.DEEPSEEK_API_KEY,
  });

  const model = wrapModelWithTelemetry(deepseek('deepseek-v4-flash'), {
    functionId: 'generate-ats-resume',
    metadata: { jobTitle, companyName },
  });

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

  const { object: resume, usage: apiUsage } = await generateObject({
    model,
    system: systemPrompt,
    prompt: prompt,
    schema: atsResumeSchema,
    maxRetries: 3,
    temperature: 0.4,
  });

  const anyUsage = apiUsage as Record<string, any>;
  const inputTokens = (anyUsage.promptTokens as number | undefined) ?? apiUsage.inputTokens ?? 0;
  const cachedTokens = (anyUsage.promptTokensDetails as { cachedTokens?: number } | undefined)?.cachedTokens ?? (anyUsage.cachedInputTokens as number | undefined) ?? 0;
  const outputTokens = (anyUsage.completionTokens as number | undefined) ?? apiUsage.outputTokens ?? 0;

  const resumeMd = convertAtsResumeToMarkdown(resume, userName || 'Candidate', userEmail || '');

  return {
    resumeMd,
    usage: {
      promptCacheHitTokens: cachedTokens,
      promptCacheMissTokens: inputTokens - cachedTokens,
      completionTokens: outputTokens,
    },
    changesMade: resume.changes_made,
    keywordsUsed: resume.ats_keywords_used,
  };
}