import { db, initDb } from "../db/index";
import { jobs, keyRotation } from "../db/schema";
import { sql, lt, desc, and, eq } from "drizzle-orm";

/**
 * Fetch all tokens and their current usage for the admin dashboard.
 */
export async function getAllApifyTokens() {
  await initDb();
  return await db.select().from(keyRotation).orderBy(keyRotation.id);
}

/**
 * Insert a new Apify token.
 */
export async function addApifyToken(apiKey: string, subscriptionStartDate: string) {
  await initDb();
  return await db.insert(keyRotation).values({
    apiKey,
    subscriptionStartDate,
    usageCost: 0
  }).returning();
}

/**
 * Delete an Apify token.
 */
export async function deleteApifyToken(id: number) {
  await initDb();
  return await db.delete(keyRotation).where(eq(keyRotation.id, id));
}

/**
 * Manually update/reset a token's usage or status.
 */
export async function updateApifyToken(id: number, data: Partial<{ usageCost: number; subscriptionStartDate: string }>) {
  await initDb();
  return await db.update(keyRotation)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(keyRotation.id, id))
    .returning();
}

/**
 * Fetch an active Apify token.
 * Strategy: 
 * 1. Reset usage/expiry if today is the monthly renewal day.
 * 2. Get one that is NOT expired, cost < $5.00, and has the MOST usage.
 */
export async function getValidApifyToken(): Promise<{ id: number; apiKey: string } | null> {
  await initDb();
  
  // const today = new Date();
  // const currentDay = today.getDate();

  // // 1. Auto-reset tokens whose monthly cycle starts yesterday (reset today to be safe)
  // // We check if currentDay matches (subscriptionStartDate + 1 day)
  // await db.update(keyRotation)
  //   .set({ 
  //     usageCost: 0, 
  //     updatedAt: today 
  //   })
  //   .where(sql`EXTRACT(DAY FROM ${keyRotation.subscriptionStartDate} + INTERVAL '1 day') = ${currentDay}`);

  // 2. Fetch the best valid token
  const result = await db.select()
    .from(keyRotation)
    .where(lt(keyRotation.usageCost, 5.00))
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
 * Mark a token as exhausted (e.g., when receiving 403 Monthly usage exceeded).
 */
export async function markApifyTokenExpired(tokenId: number): Promise<void> {
  await initDb();
  await db.update(keyRotation)
    .set({ usageCost: 5, updatedAt: new Date() })
    .where(eq(keyRotation.id, tokenId));
}

/**
 * Reset usage cost to 0 for tokens that have reached $5 or more and whose subscription has already started.
 * Date-only comparison is required (day of month, month, year), no time-of-day differences.
 */
export async function resetHighUsageTokens(): Promise<void> {
  await initDb();
  await db.update(keyRotation)
    .set({ usageCost: 0, updatedAt: new Date() })
    .where(and(
      sql`${keyRotation.usageCost} >= 5`,
      // compare full date, ignoring time, so subscriptionStartDate: 2026-03-23 will not reset on 2026-03-22
      sql`DATE(${keyRotation.subscriptionStartDate}) <= CURRENT_DATE`
    ));
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
