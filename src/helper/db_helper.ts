import { db, initDb } from "../db/index";
import { jobs, keyRotation } from "../db/schema";
import { sql, lt, desc, and, eq } from "drizzle-orm";

/**
 * Fetch an active Apify token.
 * Strategy: Get one that is NOT expired, cost < $5.00, and has the MOST usage (to exhaust one by one).
 */
export async function getValidApifyToken(): Promise<{ id: number; apiKey: string } | null> {
  await initDb();
  const result = await db.select()
    .from(keyRotation)
    .where(and(
      eq(keyRotation.isExpired, false),
      lt(keyRotation.usageCost, 5.00)
    ))
    .orderBy(desc(keyRotation.usageCost))
    .limit(1);

  return result.length > 0 ? { id: result[0].id, apiKey: result[0].apiKey } : null;
}

/**
 * Update the usage cost for a token.
 * Cost calculation: $0.001 per job, rounded to 2 decimal places.
 * If 25 jobs -> 0.025 -> 0.03
 * If 24 jobs -> 0.024 -> 0.02
 */
export async function updateApifyTokenUsage(tokenId: number, jobsCount: number): Promise<void> {
  const incrementalCost = Number((jobsCount * 0.001).toFixed(2));
  await initDb();
  await db.update(keyRotation)
    .set({ 
      usageCost: sql`${keyRotation.usageCost} + ${incrementalCost}`,
      updatedAt: new Date()
    })
    .where(eq(keyRotation.id, tokenId));
}

/**
 * Mark a token as expired (e.g., when receiving 403 Monthly usage exceeded).
 */
export async function markApifyTokenExpired(tokenId: number): Promise<void> {
  await initDb();
  await db.update(keyRotation)
    .set({ isExpired: true, updatedAt: new Date() })
    .where(eq(keyRotation.id, tokenId));
}

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
    links: new Set(result.map((r: { jobLink: string }) => r.jobLink)),
    fingerprints: new Set(result.map((r: { fingerprint: string | null }) => r.fingerprint).filter((f: string | null): f is string => !!f))
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
