import { db, initDb } from "../db/index";
import { jobs, keyRotation, users, userRuns } from "../db/schema";
import { sql, lt, desc, and, eq, gte, lte, or, isNull, inArray, SQL } from "drizzle-orm";
import { convertInrToUsd } from "./currency_helper";

const MIN_MATCH_SCORE = parseInt(process.env.MIN_MATCH_SCORE ?? "80", 10);

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

// Fetch candidate's previously seen job links and fingerprints for the incoming batch to prevent duplicate delivery per user (UUID)
export async function getExistingJobsData(
  userId: string,
  candidateLinks: string[] = [],
  candidateFingerprints: string[] = []
): Promise<{ links: Set<string>, fingerprints: Set<string> }> {
  if (candidateLinks.length === 0 && candidateFingerprints.length === 0) {
    return { links: new Set(), fingerprints: new Set() };
  }

  await initDb();

  const conditions = [];
  if (candidateLinks.length > 0) {
    conditions.push(inArray(jobs.jobLink, candidateLinks));
  }
  if (candidateFingerprints.length > 0) {
    conditions.push(inArray(jobs.fingerprint, candidateFingerprints));
  }

  const result = await db.select({ 
    jobLink: jobs.jobLink, 
    fingerprint: jobs.fingerprint 
  })
  .from(jobs)
  .where(and(eq(jobs.userId, userId), or(...conditions)));
  
  return {
    links: new Set(result.map((r: { jobLink: string }) => r.jobLink)),
    fingerprints: new Set(result.map((r: { fingerprint: string | null }) => r.fingerprint).filter((f: string | null): f is string => !!f))
  };
}

// Insert newly processed job links into candidate's personal ledger using ON CONFLICT DO NOTHING (UUID) inside an atomic transaction
export async function trackJobs(
  userId: string, 
  jobsToTrack: { 
    link: string; 
    fingerprint: string;
    jobTitle?: string;
    companyName?: string;
    location?: string;
    postedAt?: string;
    salary?: string;
    aiScore?: number;
    aiReason?: string;
    matchedSkills?: string[];
    missingSkills?: string[];
    requiredYoe?: string;
    directApply?: string | null;
    applicantsCount?: string | number;
    optimizedResumeMd?: string;
    descriptionText?: string;
  }[]
): Promise<void> {
  if (jobsToTrack.length === 0) return;
  const deduped = [...new Map(jobsToTrack.map(j => [j.link, j])).values()];
  await initDb();

  try {
    await db.transaction(async (tx) => {
      await tx.insert(jobs)
        .values(deduped.map(j => ({ 
          userId, 
          jobLink: j.link, 
          fingerprint: j.fingerprint,
          jobTitle: j.jobTitle,
          companyName: j.companyName,
          location: j.location,
          postedAt: j.postedAt,
          salary: j.salary,
          aiScore: j.aiScore,
          aiReason: j.aiReason,
          matchedSkills: j.matchedSkills || [],
          missingSkills: j.missingSkills || [],
          requiredYoe: j.requiredYoe,
          directApply: j.directApply,
          applicantsCount: j.applicantsCount ? String(j.applicantsCount) : undefined,
          optimizedResumeMd: j.optimizedResumeMd,
          descriptionText: j.descriptionText,
        })))
        .onConflictDoNothing();
    });
  } catch (err) {
    console.error(`Transaction failed in trackJobs for user ID ${userId}:`, err);
    throw err;
  }
}

// Automatically delete unmatched/rejected jobs older than N days (default 7 days) to keep DB lean using an atomic transaction
export async function purgeOldUnmatchedJobs(days: number = 7): Promise<number> {
  await initDb();
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  try {
    return await db.transaction(async (tx) => {
      const deleted = await tx.delete(jobs)
        .where(
          and(
            lt(jobs.createdAt, cutoff),
            or(
              isNull(jobs.aiScore),
              lt(jobs.aiScore, MIN_MATCH_SCORE)
            )
          )
        )
        .returning({ id: jobs.id });

      console.log(`Purged ${deleted.length} unmatched jobs older than ${days} days.`);
      return deleted.length;
    });
  } catch (err) {
    console.error(`Transaction failed in purgeOldUnmatchedJobs(${days}):`, err);
    throw err;
  }
}

// Retrieve matched jobs with pagination, date range, and min/max score filtering
export async function getJobsForUser(
  identifier: string,
  options: {
    page?: number;
    limit?: number;
    fromDate?: string;
    toDate?: string;
    minScore?: number;
    maxScore?: number;
  } = {}
) {
  // Clamp page (min 1) and limit (min 10, max 100, default 50)
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(10, options.limit || 50));
  const offset = (page - 1) * limit;

  // Clamp score range between 0 and 100 (default min from MIN_MATCH_SCORE env, max 100)
  const rawMin = options.minScore ?? MIN_MATCH_SCORE;
  const rawMax = options.maxScore ?? 100;
  const minScore = Math.min(100, Math.max(0, rawMin));
  const maxScore = Math.min(100, Math.max(minScore, rawMax));

  await initDb();

  // Resolve identifier (email or UUID) to target user ID
  let targetUserId = identifier.trim();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetUserId);
  if (!isUuid || targetUserId.includes('@')) {
    const userRows = await db.select({ id: users.id })
      .from(users)
      .where(eq(sql`LOWER(${users.email})`, targetUserId.toLowerCase()))
      .limit(1);
    if (userRows.length > 0) {
      targetUserId = userRows[0].id;
    } else {
      return {
        jobs: [],
        total: 0,
        page,
        limit,
        totalPages: 1,
        filters: { minScore, maxScore },
        user: null
      };
    }
  }

  // Filter matched jobs within [minScore, maxScore] range
  const conditions: SQL[] = [
    eq(jobs.userId, targetUserId),
    gte(jobs.aiScore, minScore),
    lte(jobs.aiScore, maxScore)
  ];

  if (options.fromDate) {
    conditions.push(gte(jobs.createdAt, new Date(options.fromDate)));
  }
  if (options.toDate) {
    const endOfDay = new Date(options.toDate);
    endOfDay.setHours(23, 59, 59, 999);
    conditions.push(lte(jobs.createdAt, endOfDay));
  }

  const whereClause = and(...conditions);

  // Fetch paginated matched jobs
  const jobsList = await db.select()
    .from(jobs)
    .where(whereClause)
    .orderBy(desc(jobs.aiScore), desc(jobs.createdAt))
    .limit(limit)
    .offset(offset);

  // Fetch total count for pagination math
  const countResult = await db.select({ count: sql<number>`count(*)` })
    .from(jobs)
    .where(whereClause);

  // Fetch candidate profile details for dashboard display
  const userResult = await db.select({
    id: users.id,
    name: users.name,
    email: users.email,
    experienceYears: users.experienceYears,
    targetLocations: users.targetLocations,
    employmentType: users.employmentType,
    primaryDomain: users.primaryDomain,
    candidateSummary: users.candidateSummary,
    knownSkills: users.knownSkills,
    suggestedJobTitles: users.suggestedJobTitles,
    telegramChatId: users.telegramChatId,
  }).from(users).where(eq(users.id, targetUserId)).limit(1);

  const total = Number(countResult[0]?.count || 0);

  return {
    jobs: jobsList,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
    filters: { minScore, maxScore },
    user: userResult[0] || null
  };
}

// ponytail: Get a single job by DB ID or fingerprint for ATS resume rendering
export async function getJobByFingerprintOrId(idOrFingerprint: string) {
  await initDb();
  const numericId = parseInt(idOrFingerprint, 10);
  const rows = await db.select()
    .from(jobs)
    .where(
      !isNaN(numericId) && String(numericId) === idOrFingerprint.trim()
        ? eq(jobs.id, numericId)
        : eq(jobs.fingerprint, idOrFingerprint.trim())
    )
    .limit(1);
  return rows[0] || null;
}

// ponytail: Cache newly generated ATS resume Markdown for a job
export async function updateJobResumeMd(jobId: number, resumeMd: string) {
  await initDb();
  await db.update(jobs)
    .set({ optimizedResumeMd: resumeMd })
    .where(eq(jobs.id, jobId));
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

// Fetch minimal active user fields for fan-out orchestration to minimize network payload
export async function getActiveUsersMinimal() {
  await initDb();
  return await db.select({
    id: users.id,
    email: users.email,
    isActive: users.isActive,
    telegramChatId: users.telegramChatId
  }).from(users).where(eq(users.isActive, true));
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
  telegramChatId?: string;
  linkedinCredentials?: { accessToken?: string; refreshToken?: string; personUrn?: string };
  balanceUsd?: number;
  customRunCostUsd?: number;
  excludeTitleKeywords?: string[];
  experienceYears?: number;
  targetLocations?: string;
  employmentType?: string;
  primaryDomain?: string;
  candidateSummary?: string;
  knownSkills?: string[];
  education?: string[];
  projects?: Array<{ project_title: string; project_description: string }>;
  certifications?: string[];
  keyHighlights?: string[];
  suggestedJobTitles?: string[];
  source?: string;
  isActive?: boolean;
}) {
  await initDb();
  return await db.insert(users).values(userData).returning();
}

// Update existing user fields in database by UUID string
export async function updateUser(id: string, data: Partial<{
  email: string;
  name: string;
  resumeText: string;
  telegramChatId: string;
  linkedinCredentials: { accessToken?: string; refreshToken?: string; personUrn?: string };
  balanceUsd: number;
  customRunCostUsd: number;
  excludeTitleKeywords: string[];
  experienceYears: number;
  targetLocations: string;
  employmentType: string;
  primaryDomain: string;
  candidateSummary: string;
  knownSkills: string[];
  education: string[];
  projects: Array<{ project_title: string; project_description: string }>;
  certifications: string[];
  keyHighlights: string[];
  suggestedJobTitles: string[];
  source?: string;
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

  await db.transaction(async (tx) => {
    // Record audit log entry in user_runs table
    await tx.insert(userRuns).values({
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
      await tx.update(users)
        .set({
          balanceUsd: sql`${users.balanceUsd} - ${billedCost}`,
          totalRunsCount: sql`${users.totalRunsCount} + 1`,
          lastRunAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(users.id, userId));
    }
  });
}

// ─── Financial Analytics & Cost Dashboard Helpers ────────────────────────────

// Fetch aggregated metrics, profit analytics, and monthly breakdown for Admin Dashboard
export async function getAnalyticsStats() {
  await initDb();

  // Aggregated user metrics natively in SQL
  const userCounts = await db.select({
    totalUsersCount: sql<number>`COUNT(*)`,
    activeUsersCount: sql<number>`COUNT(*) FILTER (WHERE ${users.isActive} = true)`
  }).from(users);

  const totalUsersCount = Number(userCounts[0]?.totalUsersCount || 0);
  const activeUsersCount = Number(userCounts[0]?.activeUsersCount || 0);

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
