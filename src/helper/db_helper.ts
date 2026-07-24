import { db, initDb } from "../db/index";
import { jobs, keyRotation, users, userRuns } from "../db/schema";
import { sql, lt, desc, and, eq } from "drizzle-orm";
import { convertInrToUsd } from "./currency_helper";

// ─── Key Rotation Helpers ────────────────────────────────────────────────────

// Fetch all API tokens and current costs for key rotation dashboard
export async function getAllApifyTokens() {
  await initDb();
  return await db.select().from(keyRotation).orderBy(keyRotation.id);
}

// Add a new Apify API token into the shared rotation pool
export async function addApifyToken(apiKey: string, subscriptionStartDate: string, name?: string) {
  await initDb();
  return await db.insert(keyRotation).values({
    apiKey,
    subscriptionStartDate,
    name: name || "Apify Token",
    usageCost: 0
  }).returning();
}

// Remove an Apify token from the rotation pool
export async function deleteApifyToken(id: number) {
  await initDb();
  return await db.delete(keyRotation).where(eq(keyRotation.id, id));
}

// Update token details such as usage cost or renewal date
export async function updateApifyToken(id: number, data: Partial<{ apiKey: string; name: string; usageCost: number; subscriptionStartDate: string }>) {
  await initDb();
  return await db.update(keyRotation)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(keyRotation.id, id))
    .returning();
}

// Retrieve an active Apify token with usage cost under $5.00 limit
export async function getValidApifyToken(): Promise<{ id: number; apiKey: string } | null> {
  await initDb();
  const result = await db.select()
    .from(keyRotation)
    .where(lt(keyRotation.usageCost, 5.00))
    .orderBy(desc(keyRotation.usageCost))
    .limit(1);

  return result.length > 0 ? { id: result[0].id, apiKey: result[0].apiKey } : null;
}

// Atomically increment usage cost on the Apify token after scraping jobs
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

// Mark token as exhausted when rate limited or monthly quota exceeded
export async function markApifyTokenExpired(tokenId: number): Promise<void> {
  await initDb();
  await db.update(keyRotation)
    .set({ usageCost: 5, updatedAt: new Date() })
    .where(eq(keyRotation.id, tokenId));
}

// Reset usage cost to zero for expired subscription cycles
export async function resetHighUsageTokens(): Promise<void> {
  await initDb();
  await db.update(keyRotation)
    .set({ usageCost: 0, updatedAt: new Date() })
    .where(and(
      sql`${keyRotation.usageCost} >= 5`,
      sql`DATE(${keyRotation.subscriptionStartDate}) <= CURRENT_DATE`
    ));
}

// ─── Per-User Jobs Deduplication Helpers ─────────────────────────────────────

// Fetch candidate's previously seen job links and fingerprints to prevent duplicate delivery per user (UUID)
export async function getExistingJobsData(userId: string): Promise<{ links: Set<string>, fingerprints: Set<string> }> {
  await initDb();
  const result = await db.select({ 
    jobLink: jobs.jobLink, 
    fingerprint: jobs.fingerprint 
  })
  .from(jobs)
  .where(eq(jobs.userId, userId));
  
  return {
    links: new Set(result.map((r: { jobLink: string }) => r.jobLink)),
    fingerprints: new Set(result.map((r: { fingerprint: string | null }) => r.fingerprint).filter((f: string | null): f is string => !!f))
  };
}

// Insert newly processed job links into candidate's personal ledger using ON CONFLICT DO NOTHING (UUID)
export async function trackJobs(userId: string, jobsToTrack: { link: string; fingerprint: string }[]): Promise<void> {
  if (jobsToTrack.length === 0) return;
  const deduped = [...new Map(jobsToTrack.map(j => [j.link, j])).values()];
  await initDb();
  await db.insert(jobs)
    .values(deduped.map(j => ({ userId, jobLink: j.link, fingerprint: j.fingerprint })))
    .onConflictDoNothing();
}

// ─── Multi-Tenant Users & Wallet Helpers ─────────────────────────────────────

// Fetch all users from database regardless of active state
export async function getAllUsers() {
  await initDb();
  return await db.select().from(users).orderBy(users.createdAt);
}

// Fetch all users with active state enabled
export async function getActiveUsers() {
  await initDb();
  return await db.select().from(users).where(eq(users.isActive, true));
}

// Fetch a single user by primary key string UUID
export async function getUserById(id: string) {
  await initDb();
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0] || null;
}

// Fetch a user by their Telegram Chat ID for webhook command processing
export async function getUserByTelegramChatId(chatId: string) {
  await initDb();
  const result = await db.select().from(users).where(eq(users.telegramChatId, chatId)).limit(1);
  return result[0] || null;
}

// Create a new user record in database
export async function createUser(userData: {
  email: string;
  name?: string;
  resumeText: string;
  linkedinSearchUrls: string[];
  telegramChatId?: string;
  linkedinCredentials?: { accessToken?: string; refreshToken?: string; personUrn?: string };
  balanceUsd?: number;
  customRunCostUsd?: number;
  excludeTitleKeywords?: string[];
  isActive?: boolean;
}) {
  await initDb();
  return await db.insert(users).values({
    ...userData,
    balanceUsd: userData.balanceUsd ?? 0.0,
    excludeTitleKeywords: userData.excludeTitleKeywords ?? [],
    isActive: userData.isActive ?? true,
  }).returning();
}

// Update existing user fields in database by UUID string
export async function updateUser(id: string, data: Partial<{
  email: string;
  name: string;
  resumeText: string;
  linkedinSearchUrls: string[];
  telegramChatId: string;
  linkedinCredentials: Record<string, any>;
  balanceUsd: number;
  customRunCostUsd: number;
  excludeTitleKeywords: string[];
  isActive: boolean;
}>) {
  await initDb();
  return await db.update(users)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning();
}

// Delete user by string UUID from database
export async function deleteUser(id: string) {
  await initDb();
  return await db.delete(users).where(eq(users.id, id)).returning();
}

// Toggle user active status when /start or /stop is received via Telegram
export async function setUserActiveStatus(userId: string, isActive: boolean) {
  await initDb();
  return await db.update(users)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
}

// Recharge user wallet balance converting INR payment to USD balance
export async function topUpUserBalance(userId: string, amountInr: number) {
  const usdAmount = convertInrToUsd(amountInr);
  await initDb();
  return await db.update(users)
    .set({ 
      balanceUsd: sql`${users.balanceUsd} + ${usdAmount}`,
      isActive: true,
      updatedAt: new Date()
    })
    .where(eq(users.id, userId))
    .returning();
}

// Log execution turn details into userRuns and deduct flat rate from user wallet (UUID)
export async function recordAndDeductUserRun(
  userId: string,
  runData: {
    status: string;
    scrapedJobsCount: number;
    batchDedupCount?: number;
    dbDedupCount?: number;
    keywordFilteredCount: number;
    matchedJobsCount: number;
    rejectedJobsCount: number;
    actualLlmCostUsd: number;
    actualApifyCostUsd: number;
    errorMessage?: string;
  },
  customRunCostUsd?: number | null
) {
  const defaultBilledCost = parseFloat(process.env.DEFAULT_BILLED_RUN_COST_USD ?? "0.1");
  const billedCost = customRunCostUsd ?? defaultBilledCost;
  await initDb();

  // Record audit log entry in user_runs table
  await db.insert(userRuns).values({
    userId,
    status: runData.status,
    scrapedJobsCount: runData.scrapedJobsCount,
    batchDedupCount: runData.batchDedupCount ?? 0,
    dbDedupCount: runData.dbDedupCount ?? 0,
    keywordFilteredCount: runData.keywordFilteredCount,
    matchedJobsCount: runData.matchedJobsCount,
    rejectedJobsCount: runData.rejectedJobsCount,
    actualLlmCostUsd: runData.actualLlmCostUsd,
    actualApifyCostUsd: runData.actualApifyCostUsd,
    billedRunCostUsd: runData.status === 'SUCCESS' ? billedCost : 0,
    errorMessage: runData.errorMessage
  });

  // Deduct billed run cost from wallet and increment user metrics on success
  if (runData.status === 'SUCCESS') {
    await db.update(users)
      .set({
        balanceUsd: sql`${users.balanceUsd} - ${billedCost}`,
        totalRunsCount: sql`${users.totalRunsCount} + 1`,
        lastRunAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(users.id, userId));
  }
}

// ─── Financial Analytics & Cost Dashboard Helpers ────────────────────────────

// Fetch aggregated metrics, profit analytics, and monthly breakdown for Admin Dashboard
export async function getAnalyticsStats() {
  await initDb();

  // Aggregated user metrics
  const userList = await db.select().from(users);
  const totalUsersCount = userList.length;
  const activeUsersCount = userList.filter((u: { isActive: boolean }) => u.isActive).length;

  // Aggregate user_runs financial stats
  const runsStats = await db.select({
    totalRuns: sql<number>`COUNT(*)`,
    successfulRuns: sql<number>`COUNT(*) FILTER (WHERE ${userRuns.status} = 'SUCCESS')`,
    totalBilledRevenueUsd: sql<number>`COALESCE(SUM(${userRuns.billedRunCostUsd}), 0)`,
    totalActualLlmCostUsd: sql<number>`COALESCE(SUM(${userRuns.actualLlmCostUsd}), 0)`,
    totalActualApifyCostUsd: sql<number>`COALESCE(SUM(${userRuns.actualApifyCostUsd}), 0)`
  }).from(userRuns);

  const stats = runsStats[0] || {
    totalRuns: 0,
    successfulRuns: 0,
    totalBilledRevenueUsd: 0,
    totalActualLlmCostUsd: 0,
    totalActualApifyCostUsd: 0
  };

  const totalBilledRevenueUsd = Number(stats.totalBilledRevenueUsd);
  const totalActualCostUsd = Number(stats.totalActualLlmCostUsd) + Number(stats.totalActualApifyCostUsd);
  const totalProfitUsd = totalBilledRevenueUsd - totalActualCostUsd;

  // Monthly breakdown of revenue, actual cost, and net profit
  const monthlyStats = await db.select({
    month: sql<string>`TO_CHAR(${userRuns.runAt}, 'YYYY-MM')`,
    runsCount: sql<number>`COUNT(*)`,
    billedRevenueUsd: sql<number>`COALESCE(SUM(${userRuns.billedRunCostUsd}), 0)`,
    actualCostUsd: sql<number>`COALESCE(SUM(${userRuns.actualLlmCostUsd} + ${userRuns.actualApifyCostUsd}), 0)`
  })
  .from(userRuns)
  .groupBy(sql`TO_CHAR(${userRuns.runAt}, 'YYYY-MM')`)
  .orderBy(sql`TO_CHAR(${userRuns.runAt}, 'YYYY-MM') DESC`);

  const formattedMonthly = monthlyStats.map((m: { month: string; runsCount: number; billedRevenueUsd: number; actualCostUsd: number }) => {
    const rev = Number(m.billedRevenueUsd);
    const cost = Number(m.actualCostUsd);
    return {
      month: m.month,
      runsCount: Number(m.runsCount),
      billedRevenueUsd: rev,
      actualCostUsd: cost,
      netProfitUsd: rev - cost
    };
  });

  const defaultBilledRunCostUsd = parseFloat(process.env.DEFAULT_BILLED_RUN_COST_USD ?? "0.1");

  return {
    totalUsersCount,
    activeUsersCount,
    totalRunsCount: Number(stats.totalRuns),
    successfulRunsCount: Number(stats.successfulRuns),
    totalBilledRevenueUsd,
    totalActualCostUsd,
    totalProfitUsd,
    defaultBilledRunCostUsd,
    monthlyStats: formattedMonthly
  };
}
