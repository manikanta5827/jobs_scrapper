/**
 * db.ts
 * Neon Postgres via @neondatabase/serverless.
 * Uses HTTP transport — no TCP connection pool needed.
 * Perfect for Lambda: connects fresh each invocation, no warm-up.
 */

import { neon } from '@neondatabase/serverless';
import type { EnrichedJob } from '../types';

// NEON_DATABASE_URL: postgresql://user:pass@ep-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require
const sql = neon(process.env.NEON_DATABASE_URL!);

/**
 * Fetch all existing job links for deduplication.
 * Returns a Set for O(1) lookups.
 */
export async function getExistingJobLinks(): Promise<Set<string>> {
  const rows = await sql`SELECT job_link FROM jobs` as { job_link: string }[];
  return new Set(rows.map(r => r.job_link));
}

/**
 * Bulk insert all enriched jobs.
 * Uses unnest for a single query instead of N inserts.
 * ON CONFLICT DO NOTHING handles any edge-case duplicates.
 */
export async function insertJobs(jobs: EnrichedJob[]): Promise<void> {
  if (jobs.length === 0) return;

  const ist = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

  // Extract columns into arrays for unnest bulk insert
  const jobLinks = jobs.map(j => j.link ?? null);
  const jobTitles = jobs.map(j => j.title ?? null);
  const companyNames = jobs.map(j => j.companyName ?? null);
  const companyWebsites = jobs.map(j => j.companyWebsite ?? null);
  const postedAts = jobs.map(j => j.postedAt ?? null);
  const salaries = jobs.map(j => j.salary ?? null);
  const descriptions = jobs.map(j => (j.descriptionText ?? '').slice(0, 10_000));
  const applicantsCounts = jobs.map(j => String(j.applicantsCount ?? ''));
  const applyUrls = jobs.map(j => j.applyUrl ?? null);
  const statuses = jobs.map(j => j.status);
  const aiScores = jobs.map(j => j.ai_score ?? 0);
  const aiReasons = jobs.map(j => j.ai_reason ?? null);
  const aiMatchedSkills = jobs.map(j => JSON.stringify(j.ai_matched_skills ?? []));
  const aiMissingSkills = jobs.map(j => JSON.stringify(j.ai_missing_skills ?? []));
  const keywordBinReasons = jobs.map(j => j.keyword_bin_reason ?? null);
  const createdAts = jobs.map(() => ist);

  await sql`
    INSERT INTO jobs (
      job_link, job_title, company_name, company_website, posted_at,
      salary, description, applicants_count, apply_url, status,
      ai_score, ai_reason, ai_matched_skills, ai_missing_skills,
      keyword_bin_reason, created_at
    )
    SELECT * FROM unnest(
      ${jobLinks}::text[],
      ${jobTitles}::text[],
      ${companyNames}::text[],
      ${companyWebsites}::text[],
      ${postedAts}::text[],
      ${salaries}::text[],
      ${descriptions}::text[],
      ${applicantsCounts}::text[],
      ${applyUrls}::text[],
      ${statuses}::text[],
      ${aiScores}::int[],
      ${aiReasons}::text[],
      ${aiMatchedSkills}::text[],
      ${aiMissingSkills}::text[],
      ${keywordBinReasons}::text[],
      ${createdAts}::text[]
    )
    ON CONFLICT (job_link) DO NOTHING
  `;
}
