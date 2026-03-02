import { db, initDb } from "../db/index";
import { jobs, matchedJobs } from "../db/schema";
import { sql, lt } from "drizzle-orm";
import type { EnrichedJob } from "./types";

/**
 * Fetch all existing job links and fingerprints for deduplication.
 */
export async function getExistingJobsData(): Promise<{ links: Set<string>, fingerprints: Set<string> }> {
  await initDb();
  const result = await db.select({ 
    jobLink: jobs.jobLink, 
    fingerprint: jobs.fingerprint 
  }).from(jobs);
  
  return {
    links: new Set(result.map(r => r.jobLink)),
    fingerprints: new Set(result.map(r => r.fingerprint).filter((f): f is string => !!f))
  };
}

/**
 * Track all discovered jobs to avoid re-processing.
 */
export async function trackJobs(jobsToTrack: { link: string; fingerprint: string }[]): Promise<void> {
  if (jobsToTrack.length === 0) return;
  await initDb();
  await db.insert(jobs)
    .values(jobsToTrack.map(j => ({ jobLink: j.link, fingerprint: j.fingerprint })))
    .onConflictDoUpdate({ 
      target: [jobs.jobLink],
      set: { fingerprint: sql`excluded.fingerprint` }
    });
}

/**
 * Bulk insert only the jobs that passed the AI relevance check.
 */
export async function insertMatchedJobs(enrichedJobs: EnrichedJob[]): Promise<void> {
  if (enrichedJobs.length === 0) return;
  await initDb();
  const values = enrichedJobs.map((j) => ({
    jobLink: j.link!,
    fingerprint: j.fingerprint!,
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
    .onConflictDoUpdate({
      target: [matchedJobs.jobLink],
      set: { 
        fingerprint: sql`excluded.fingerprint`,
        aiScore: sql`excluded.ai_score`,
        aiReason: sql`excluded.ai_reason`,
        aiMatchedSkills: sql`excluded.ai_matched_skills`,
        aiMissingSkills: sql`excluded.ai_missing_skills`
      }
    });
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
