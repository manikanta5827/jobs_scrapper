/**
 * openai.ts
 * Checks job relevance using GPT-4o-mini with batching + retry.
 * Optimized for OpenAI Prompt Caching (50% discount on cached tokens).
 */
import type { Job, EnrichedJob, RelevanceResult, BatchResult } from "./types";

export class FatalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FatalError";
  }
}

const MIN_MATCH_SCORE = parseInt(process.env.MIN_MATCH_SCORE ?? "60", 10);

// @ts-ignore
import resumeText from "../../resume.txt";

/**
 * To maximize OpenAI Prompt Caching, we combine static content (Rules + Resume + Examples)
 * into a single "system" message prefix. This stays identical across all requests.
 *
 * Requirement: Prefix must be >= 1024 tokens to trigger caching.
 */
const SYSTEM_PROMPT = `You are a strict job-fit evaluator. Your only job is to determine if a job posting is worth applying to for this specific candidate. Be conservative — it's better to reject a borderline job than to waste the candidate's time.

## CANDIDATE RESUME
${resumeText}

---

## EVALUATION CRITERIA (ALL must pass for is_matched: true)

### 1. EXPERIENCE LEVEL — STRICT GATE
- ACCEPT: 0, 1, or 1–2 years | "Entry level" | "Junior" | "Fresher" | "Intern"
- REJECT IMMEDIATELY (score: 0): "2+ years", "3+ years", "at least 2 years", "minimum 2 years", or any Senior/Mid-level designation
- If experience requirement is ambiguous or not mentioned → do NOT reject on this criterion alone

### 2. SKILL ALIGNMENT
- HARD REJECT: Job says "must have", "required", "strong knowledge of" a skill the candidate clearly lacks (e.g., "Must have Java" → candidate has no Java)
- SOFT MISS (not a reject): Nice-to-haves or preferred skills the candidate lacks → deduct points only
- NATURAL ALIGNMENT: Count adjacent skills as matches (e.g., "React" asked, candidate has "Next.js/Frontend" → match; "cloud experience" asked, candidate has AWS → match)
- OPTIONAL SKILLS: "Java, Python, or Node.js" → candidate has Node.js → full match

### 3. DOMAIN RELEVANCE
- Must be related to: Backend Development, Cloud/AWS, AI/LLM, Fullstack, DevOps, or Software Engineering broadly
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

**Example 1 — REJECT (experience)**
Input: { "title": "Node.js Developer", "seniorityLevel": "Mid-Senior", "descriptionText": "3+ years of backend experience required..." }
Output: { "score": 0, "is_matched": false, "reason": "Requires 3+ years experience; candidate is entry-level.", "matched_skills": [], "missing_skills": [], "job_location": null, "years_of_experience": "3+ years", "direct_apply": null }

**Example 2 — REJECT (mandatory missing skill)**
Input: { "title": "Backend Developer", "descriptionText": "Must have strong Java and Spring Boot. AWS is a plus." }
Output: { "score": 15, "is_matched": false, "reason": "Java and Spring Boot are mandatory but absent from candidate's profile.", "matched_skills": ["AWS"], "missing_skills": ["Java", "Spring Boot"], "job_location": null, "years_of_experience": "not specified", "direct_apply": null }

**Example 3 — MATCH (core stack)**
Input: { "title": "Backend Intern", "seniorityLevel": "Entry level", "descriptionText": "Node.js, AWS Lambda, REST APIs. 0–1 years. Nice to have: Python." }
Output: { "score": 92, "is_matched": true, "reason": "Strong match — candidate's Node.js and AWS Lambda experience directly aligns. Python is a soft miss only.", "matched_skills": ["Node.js", "AWS Lambda", "REST APIs"], "missing_skills": ["Python (nice-to-have)"], "job_location": null, "years_of_experience": "0–1 years", "direct_apply": null }

**Example 4 — MATCH (direct apply boost)**
Input: { "title": "Junior Backend Developer", "descriptionText": "1–2 years exp, Node.js, SQL. Apply by sending your CV and GitHub to hiring@startup.com" }
Output: { "score": 97, "is_matched": true, "reason": "Excellent match on stack and experience level. Direct apply path found.", "matched_skills": ["Node.js", "SQL"], "missing_skills": [], "job_location": null, "years_of_experience": "1–2 years", "direct_apply": "Send CV and GitHub profile to hiring@startup.com" }

---

## OUTPUT FORMAT
Return ONLY valid JSON. No markdown, no explanation outside the JSON object.

{
  "score": number (0–100),
  "is_matched": boolean,
  "reason": "1–2 sentences. Be specific about why it passed or failed.",
  "matched_skills": ["list of skills from JD that candidate has"],
  "missing_skills": ["list of skills from JD that candidate lacks — label as (required) or (nice-to-have)"],
  "job_location": "city, country, or Remote — null if not mentioned",
  "years_of_experience": "exact text from JD or 'not specified'",
  "direct_apply": "full instruction string or null"
}`;

/**
 * Process jobs in batches. Each batch fires in parallel.
 * Delay between batches to respect TPM limits.
 */
export async function checkRelevanceBatch(
  jobs: Job[],
  batchSize: number = 10,
  delayMs: number = 3000,
): Promise<BatchResult> {
  const matched: EnrichedJob[] = [];
  const rejected: EnrichedJob[] = [];

  for (let i = 0; i < jobs.length; i += batchSize) {
    const batch = jobs.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(jobs.length / batchSize);

    console.log(
      `OpenAI batch ${batchNum}/${totalBatches} (${batch.length} jobs)`,
    );

    const results = await Promise.allSettled(
      batch.map((job) => checkSingleJob(job)),
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      const job = batch[j];

      if (result.status === "fulfilled") {
        const parsed: RelevanceResult = result.value;

        const isGoodMatch =
          parsed.is_matched && parsed.score >= MIN_MATCH_SCORE;

        const enriched: EnrichedJob = {
          ...job,
          status: isGoodMatch ? "matched" : "rejected",
          ai_score: parsed.score,
          ai_is_matched: parsed.is_matched,
          ai_reason: parsed.reason,
          ai_matched_skills: parsed.matched_skills,
          ai_missing_skills: parsed.missing_skills,
          ai_job_location: parsed.job_location,
          ai_yoe: parsed.years_of_experience,
          ai_direct_apply: parsed.direct_apply,
        };
        isGoodMatch ? matched.push(enriched) : rejected.push(enriched);
      } else {
        // OpenAI failed after retries
        const err = result.reason;

        // PROPAGATE FATAL ERRORS IMMEDIATELY
        if (err instanceof FatalError) {
          throw err;
        }

        const reason = err instanceof Error ? err.message : String(err);
        console.error(`Job failed OpenAI check: "${job.title}" | ${reason}`);
        rejected.push({
          ...job,
          status: "rejected",
          ai_score: 0,
          ai_is_matched: false,
          ai_reason: "OpenAI check failed",
          ai_matched_skills: [],
          ai_missing_skills: [],
          ai_direct_apply: null,
        });
      }
    }

    // Delay between batches (skip after last batch)
    if (i + batchSize < jobs.length) {
      await sleep(delayMs);
    }
  }

  return { matched, rejected };
}

export async function checkSingleJob(
  job: Job,
  retries: number = 3,
): Promise<RelevanceResult> {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
  const userMessage = `Job Details (JSON):\n-------------------\n${JSON.stringify(prepareJobPayload(job), null, 2)}\n\nEvaluate strictly based on the system rules. Return JSON only.`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await executeOpenAICall(
        userMessage,
        OPENAI_API_KEY,
        attempt,
        retries,
      );
      if (!res) continue; // Handled 429 and waiting

      return await parseAndValidateResponse(res);
    } catch (err) {
      if (err instanceof FatalError || attempt === retries) throw err;

      const backoff = attempt * 2000;
      console.warn(
        `Attempt ${attempt} failed for "${job.title}": ${err instanceof Error ? err.message : String(err)}. Retry in ${backoff}ms`,
      );
      await sleep(backoff);
    }
  }

  throw new Error(`All ${retries} attempts failed for job: ${job.title}`);
}

/**
 * Extracts and cleans job data for the LLM.
 */
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

/**
 * Handles the fetch request and specific OpenAI error codes.
 */
async function executeOpenAICall(
  userMessage: string,
  apiKey: string,
  attempt: number,
  retries: number,
): Promise<Response | null> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      max_tokens: 300,
      temperature: 0,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
    }),
  });

  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get("retry-after") ?? "5", 10);
    console.warn(
      `Rate limited. Waiting ${retryAfter}s (attempt ${attempt}/${retries})`,
    );
    await sleep(retryAfter * 1000);
    return null;
  }

  if (!res.ok) {
    await handleOpenAIError(res);
  }

  return res;
}

/**
 * Handles non-OK responses from OpenAI.
 */
async function handleOpenAIError(res: Response): Promise<never> {
  const errorText = await res.text();
  let errorData;
  try {
    errorData = JSON.parse(errorText);
  } catch {
    /* ignore non-json */
  }

  if (res.status === 401 && errorData?.error?.code === "invalid_api_key") {
    throw new FatalError(`Invalid OpenAI API Key: ${errorData.error.message}`);
  }

  throw new Error(`OpenAI HTTP ${res.status}: ${errorText}`);
}

/**
 * Parses and validates the OpenAI response content.
 */
async function parseAndValidateResponse(
  res: Response,
): Promise<RelevanceResult> {
  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;

  if (!content) throw new Error("Empty response from OpenAI");

  const parsed = JSON.parse(content) as RelevanceResult;
  if (!isValidRelevanceResult(parsed)) {
    throw new Error(`Invalid JSON shape: ${content}`);
  }

  return parsed;
}

/**
 * Type guard for RelevanceResult.
 */
function isValidRelevanceResult(parsed: any): parsed is RelevanceResult {
  return (
    typeof parsed.score === "number" &&
    typeof parsed.is_matched === "boolean" &&
    typeof parsed.reason === "string" &&
    Array.isArray(parsed.matched_skills) &&
    Array.isArray(parsed.missing_skills) &&
    "direct_apply" in parsed
  );
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
