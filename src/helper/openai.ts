/**
 * openai.ts
 * Checks job relevance using GPT-4o-mini with batching + retry.
 */
import type { Job, EnrichedJob, RelevanceResult, BatchResult } from './types';

const MIN_MATCH_SCORE = parseInt(process.env.MIN_MATCH_SCORE ?? '60', 10);

// @ts-ignore
import resumeText from "../../resume.txt";

const SYSTEM_PROMPT = `You are evaluating whether a job is worth applying to based on the candidate's profile.
Your goal is NOT to be strict — you are filtering out irrelevant jobs, not perfect ones.

## TASK
Determine if this job is worth applying to. A job is worth applying to if:
- At least 50% of required skills match the candidate's background
- The role level is not way above (e.g. 10+ YOE required but candidate has 2 = skip)
- The domain/industry is not completely unrelated

## DIRECT APPLICATION DETECTION
If the job description explicitly mentions a direct way to apply (e.g., a link to a Google Form, a Typeform, or an email address), you MUST:
1. Extract the FULL instruction into the "direct_apply" field. Include the contact method AND any specific requirements mentioned (e.g., "Send CV and Github link to jobs@co.com", "Apply via form: [link], strictly NO CVs allowed", "Email portfolio to creative@agency.com").
2. Give the job a significantly higher score (boost by 15-20 points, up to 100 max).

## OUTPUT
Return ONLY valid JSON. No markdown. No text outside the JSON.

{
  "score": number (0-100),
  "reason": "string (1-2 sentences)",
  "matched_skills": ["string"],
  "missing_skills": ["string"],
  "job_location": "string (city/state or remote status) or null if not specified",
  "years_of_experience": "string (e.g. 2+ years, or 'not specified')",
  "direct_apply": "string or null (e.g. 'Email jobs@co.com with Portfolio and Github. NO CV.')"
}

## RULES
- If completely unrelated to candidate's field = score 0
- Do NOT penalize for missing nice-to-have skills
- missing_skills = only hard requirements clearly missing from the resume`;

/**
 * Process jobs in batches. Each batch fires in parallel.
 * Delay between batches to respect TPM limits.
 */
export async function checkRelevanceBatch(
  jobs: Job[],
  batchSize: number = 10,
  delayMs: number = 3000
): Promise<BatchResult> {
  const matched: EnrichedJob[] = [];
  const rejected: EnrichedJob[] = [];

  for (let i = 0; i < jobs.length; i += batchSize) {
    const batch = jobs.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(jobs.length / batchSize);

    console.log(`OpenAI batch ${batchNum}/${totalBatches} (${batch.length} jobs)`);

    const results = await Promise.allSettled(batch.map(job => checkSingleJob(job)));

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      const job = batch[j];

      if (result.status === 'fulfilled') {
        const parsed: RelevanceResult = result.value;

        const enriched: EnrichedJob = {
          ...job,
          status: parsed.score >= MIN_MATCH_SCORE ? 'matched' : 'rejected',
          ai_score: parsed.score,
          ai_reason: parsed.reason,
          ai_matched_skills: parsed.matched_skills,
          ai_missing_skills: parsed.missing_skills,
          ai_job_location: parsed.job_location,
          ai_yoe: parsed.years_of_experience,
          ai_direct_apply: parsed.direct_apply,
        };
        parsed.score >= MIN_MATCH_SCORE ? matched.push(enriched) : rejected.push(enriched);
      } else {
        // OpenAI failed after retries — bin it, don't crash Lambda
        const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
        console.error(`Job failed OpenAI check: "${job.title}" | ${reason}`);
        rejected.push({
          ...job,
          status: 'rejected',
          ai_score: 0,
          ai_reason: 'OpenAI check failed',
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

async function checkSingleJob(job: Job, retries: number = 3): Promise<RelevanceResult> {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
  const userMessage =
    `Candidate Resume:\n------------------\n${resumeText}\n\n` +
    `Job Title:\n----------\n${job.title ?? 'Unknown'}\n\n` +
    `Job Description:\n----------------\n${(job.descriptionText ?? '').slice(0, 3000)}\n\n` +
    `Evaluate strictly based on the system rules. Return JSON only.`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          response_format: { type: 'json_object' },
          max_tokens: 300,
          temperature: 0,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userMessage },
          ],
        }),
      });

      // Rate limited — wait exactly what OpenAI says
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('retry-after') ?? '5', 10);
        console.warn(`Rate limited. Waiting ${retryAfter}s (attempt ${attempt}/${retries})`);
        await sleep(retryAfter * 1000);
        continue;
      }

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`OpenAI HTTP ${res.status}: ${text}`);
      }

      const data = await res.json() as { choices: { message: { content: string } }[] };
      const content = data.choices?.[0]?.message?.content;

      if (!content) throw new Error('Empty response from OpenAI');

      const parsed = JSON.parse(content) as RelevanceResult;

      // Validate shape
      const isValid = 
        typeof parsed.score === 'number' &&
        typeof parsed.reason === 'string' &&
        Array.isArray(parsed.matched_skills) &&
        Array.isArray(parsed.missing_skills) &&
        ('direct_apply' in parsed); // Ensure the field exists (even if null)

      if (!isValid) {
        throw new Error(`Invalid JSON shape: ${content}`);
      }

      return parsed;

    } catch (err) {
      if (attempt === retries) throw err;
      const backoff = attempt * 2000; // 2s, 4s
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`Attempt ${attempt} failed for "${job.title}": ${message}. Retry in ${backoff}ms`);
      await sleep(backoff);
    }
  }

  // TypeScript requires this even though the loop above always throws or returns
  throw new Error(`All ${retries} attempts failed for job: ${job.title}`);
}

const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));
