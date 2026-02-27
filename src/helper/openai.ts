/**
 * openai.ts
 * Checks job relevance using GPT-4o-mini with batching + retry.
 */
import { readFile } from 'node:fs/promises';
import type { Job, EnrichedJob, RelevanceResult, BatchResult } from './types';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;

if (!OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY not found");
  throw new Error("OPENAI_API_KEY not found");
}

const RESUME_TEXT = await readFile('resume.txt', 'utf8');


const SYSTEM_PROMPT = `You are evaluating whether a job is worth applying to based on the candidate's profile.
Your goal is NOT to be strict — you are filtering out irrelevant jobs, not perfect ones.

## TASK
Determine if this job is worth applying to. A job is worth applying to if:
- At least 50% of required skills match the candidate's background
- The role level is not way above (e.g. 10+ YOE required but candidate has 2 = skip)
- The domain/industry is not completely unrelated

## OUTPUT
Return ONLY valid JSON. No markdown. No text outside the JSON.

{
  "matched": boolean,
  "score": number (0-100),
  "reason": "string (1-2 sentences)",
  "matched_skills": ["string"],
  "missing_skills": ["string"]
}

## RULES
- matched: true if score >= 50
- If completely unrelated to candidate's field = score 0, matched: false
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
          status: parsed.matched ? 'matched' : 'rejected',
          ai_score: parsed.score,
          ai_reason: parsed.reason,
          ai_matched_skills: parsed.matched_skills,
          ai_missing_skills: parsed.missing_skills,
        };
        parsed.matched ? matched.push(enriched) : rejected.push(enriched);
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
  const userMessage =
    `Candidate Resume:\n------------------\n${RESUME_TEXT}\n\n` +
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

      if (typeof parsed.matched !== 'boolean' || typeof parsed.score !== 'number') {
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
