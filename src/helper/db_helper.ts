import { db, initDb } from "../db/index";
import { jobs, matchedJobs } from "../db/schema";
import { sql, lt } from "drizzle-orm";
import type { EnrichedJob } from "./types";

/**
 * Fetch all existing job links for deduplication.
 * Returns a Set for O(1) lookups.
 */
export async function getExistingJobLinks(): Promise<Set<string>> {
  await initDb();
  const result = await db.select({ jobLink: jobs.jobLink }).from(jobs);
  return new Set(result.map((r: any) => r.jobLink));
}

/**
 * Track all discovered job links to avoid re-processing.
 */
export async function trackJobLinks(links: string[]): Promise<void> {
  if (links.length === 0) return;
  await initDb();
  await db.insert(jobs)
    .values(links.map(link => ({ jobLink: link })))
    .onConflictDoNothing();
}

/**
 * Bulk insert only the jobs that passed the AI relevance check.
 */
export async function insertMatchedJobs(enrichedJobs: EnrichedJob[]): Promise<void> {
  if (enrichedJobs.length === 0) return;
  await initDb();
  const values = enrichedJobs.map((j) => ({
    jobLink: j.link!,
    jobTitle: j.title,
    companyName: j.companyName,
    companyWebsite: j.companyWebsite,
    postedAt: j.postedAt,
    salary: j.salary!,
    applicantsCount: String(j.applicantsCount ?? ""),
    applyUrl: j.applyUrl,
    aiScore: j.ai_score,
    aiReason: j.ai_reason,
    aiMatchedSkills: JSON.stringify(j.ai_matched_skills ?? []),
    aiMissingSkills: JSON.stringify(j.ai_missing_skills ?? []),
  }));

  await db.insert(matchedJobs)
    .values(values)
    .onConflictDoNothing();
}

/**
 * Cleanup old jobs seen more than 7 days ago.
 */
export async function cleanupOldSeenJobs(): Promise<void> {
  try {
    await initDb();
    await db.delete(jobs).where(lt(jobs.seenAt, sql`NOW() - INTERVAL '7 days'`));
    console.log("Cleaned up old jobs");
  } catch (error: any) {
    const errorMessage = error?.message || "Deleting jobs failed from DB";
    console.error(`DB Cleanup Error: ${errorMessage}`);
  }
}
