/**
 * openai.ts
 * Checks job relevance using GPT-4o-mini with batching + retry.
 * Optimized for OpenAI Prompt Caching (50% discount on cached tokens).
 */
import type { Job, EnrichedJob, RelevanceResult, BatchResult } from './types';

const MIN_MATCH_SCORE = parseInt(process.env.MIN_MATCH_SCORE ?? '60', 10);

// @ts-ignore
import resumeText from "../../resume.txt";

/**
 * To maximize OpenAI Prompt Caching, we combine static content (Rules + Resume + Examples)
 * into a single "system" message prefix. This stays identical across all requests.
 * 
 * Requirement: Prefix must be >= 1024 tokens to trigger caching.
 */
const SYSTEM_PROMPT = `You are evaluating whether a job is worth applying to based on the candidate's profile.
Your goal is to strictly filter out irrelevant jobs and focus on roles that align with the candidate's skills and experience level.

## TASK
Determine if this job is a good match. A job is a good match only if it meets ALL the following criteria:
1. **Experience Level (STRICT)**: You are looking for entry-level roles.
   - Target: 0 years, 1 year, or 1-2 years of experience.
   - Accept: "Entry level", "Junior", "0-1 years", "1-2 years".
   - REJECT: "2+ years", "3+ years", "5+ years", or any requirement clearly ≥ 2 years. If the JD says "at least 2 years", it is a REJECT.
2. **Skill Alignment**: 
   - **Matched**: If a skill is in the resume OR is naturally aligned (e.g., JD asks for "HTML/CSS" and candidate has "React.js/Frontend" = Match).
   - **Optional Skills**: If JD allows "any of X, Y, or Z" (e.g., "Java, Python, or Node.js") and the candidate has one = Match.
   - **Strict Requirements**: If JD specifies a mandatory skill (e.g., "Must have Java", "Strong Java knowledge required") and it's not in the resume/not aligned = REJECT.
3. **Relevance**: The domain/industry should be related to the candidate's field.

## CANDIDATE RESUME
------------------
${resumeText}

## EXAMPLES OF EVALUATION (FEW-SHOT)
----------------------------------
Example 1 (REJECT - Experience):
Job: { "title": "Senior Node.js Developer", "seniorityLevel": "Senior", "descriptionText": "5+ years experience required..." }
Result: { "score": 0, "is_matched": false, "reason": "Job requires 5+ years of experience, but candidate is entry-level." }

Example 2 (REJECT - Skills):
Job: { "title": "C++ Developer", "descriptionText": "Must have strong C++ and Unreal Engine knowledge." }
Result: { "score": 20, "is_matched": false, "reason": "Candidate lacks mandatory C++ and Unreal Engine skills." }

Example 3 (MATCH):
Job: { "title": "Backend Intern", "seniorityLevel": "Entry level", "descriptionText": "Node.js, AWS, SQL. 0-1 years exp." }
Result: { "score": 95, "is_matched": true, "reason": "Perfect match for an entry-level backend role using candidate's core stack (Node/AWS)." }

## DIRECT APPLICATION DETECTION
If the job description explicitly mentions a direct way to apply (e.g., a link to a Google Form, a Typeform, or an email address), you MUST:
1. Extract the FULL instruction into the "direct_apply" field. Include the contact method AND any specific requirements mentioned (e.g., "Send CV and Github link to jobs@co.com").
2. Give the job a significantly higher score (boost by 15-20 points, up to 100 max).

## OUTPUT
Return ONLY valid JSON. No markdown. No text outside the JSON.

{
  "score": number (0-100),
  "is_matched": boolean (true if score >= ${MIN_MATCH_SCORE}, experience <= 2 years, and hard skills are aligned),
  "reason": "string (1-2 sentences explaining why it is or isn't a match)",
  "matched_skills": ["string"],
  "missing_skills": ["string"],
  "job_location": "string (city/state or remote status) or null if not specified",
  "years_of_experience": "string (e.g. 1-2 years, or 'not specified')",
  "direct_apply": "string or null"
}

## RULES
- If experience >= 2 years = is_matched: false, score: 0
- If mandatory hard skills are missing = is_matched: false
- If completely unrelated field = is_matched: false, score: 0`;

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

        const isGoodMatch = parsed.is_matched && parsed.score >= MIN_MATCH_SCORE;

        const enriched: EnrichedJob = {
          ...job,
          status: isGoodMatch ? 'matched' : 'rejected',
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
        // OpenAI failed after retries — bin it, don't crash Lambda
        const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
        console.error(`Job failed OpenAI check: "${job.title}" | ${reason}`);
        rejected.push({
          ...job,
          status: 'rejected',
          ai_score: 0,
          ai_is_matched: false,
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

  // High-signal fields for LLM reasoning
  const jobForOpenAI = {
    title: job.title,
    companyName: job.companyName,
    companyDescription: job.companyDescription,
    location: job.location,
    seniorityLevel: job.seniorityLevel,
    employmentType: job.employmentType,
    jobFunction: job.jobFunction,
    industries: job.industries,
    salary: job.salary,
    descriptionText: (job.descriptionText ?? '').slice(0, 5000), 
    benefits: job.benefits,
  };

  const userMessage =
    `Job Details (JSON):\n-------------------\n${JSON.stringify(jobForOpenAI, null, 2)}\n\n` +
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
        typeof parsed.is_matched === 'boolean' &&
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
