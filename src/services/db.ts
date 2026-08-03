import { db, initDb } from "../db/index";
import { jobs, users, userRuns } from "../db/schema";
import { sql, lt, desc, and, eq, gte, lte, or, isNull, isNotNull, inArray, SQL } from "drizzle-orm";
import { Tier, MIN_MATCH_SCORE, TIER_CONFIG } from '../constants';
import { sendTelegramMessage } from './telegram';



// ─── Per-User Jobs Deduplication Helpers ─────────────────────────────────────

// Fetch candidate's previously seen job links and fingerprints for the incoming batch to prevent duplicate delivery per user (UUID)
export async function getExistingJobsData(
  userId: string,
  candidateFingerprints: string[] = []
): Promise<Set<string>> {
  if (candidateFingerprints.length === 0) {
    return new Set();
  }

  await initDb();

  const result = await db.select({ 
    fingerprint: jobs.fingerprint 
  })
  .from(jobs)
  .where(and(
    eq(jobs.userId, userId),
    inArray(jobs.fingerprint, candidateFingerprints)
  ));
  
  return new Set(result.map((r) => r.fingerprint as string));
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
    jobDomain?: string | null;
    minRequiredYoe?: number | null;
    maxRequiredYoe?: number | null;
    requiredSkills?: string[];
    preferredSkills?: string[];
    candidateMatchedRequiredSkills?: string[];
    candidateMatchedPreferredSkills?: string[];
    candidateMissingRequiredSkills?: string[];
    candidateMissingPreferredSkills?: string[];
    domainMatchesCandidate?: boolean;
    aiJobLocation?: string | null;
    directApply?: string | null;
    applicantsCount?: string | number;
    optimizedResumeMd?: string;
    descriptionText?: string;
    source?: string;
  }[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (jobsToTrack.length === 0) return map;
  const deduped = [...new Map(jobsToTrack.map(j => [j.link, j])).values()];
  await initDb();

  try {
    await db.transaction(async (tx) => {
      const inserted = await tx.insert(jobs)
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
          jobDomain: j.jobDomain ?? null,
          minRequiredYoe: j.minRequiredYoe ?? null,
          maxRequiredYoe: j.maxRequiredYoe ?? null,
          requiredSkills: j.requiredSkills || [],
          preferredSkills: j.preferredSkills || [],
          candidateMatchedRequiredSkills: j.candidateMatchedRequiredSkills || [],
          candidateMatchedPreferredSkills: j.candidateMatchedPreferredSkills || [],
          candidateMissingRequiredSkills: j.candidateMissingRequiredSkills || [],
          candidateMissingPreferredSkills: j.candidateMissingPreferredSkills || [],
          domainMatchesCandidate: j.domainMatchesCandidate ?? false,
          aiJobLocation: j.aiJobLocation ?? null,
          directApply: j.directApply,
          applicantsCount: j.applicantsCount ? String(j.applicantsCount) : undefined,
          optimizedResumeMd: j.optimizedResumeMd,
          descriptionText: j.descriptionText,
          source: j.source,
        })))
        .onConflictDoNothing()
        .returning({ id: jobs.id, jobLink: jobs.jobLink, fingerprint: jobs.fingerprint });

      for (const row of inserted) {
        if (row.id && row.jobLink) {
          map.set(row.jobLink, row.id);
        }
        if (row.id && row.fingerprint) {
          map.set(row.fingerprint, row.id);
        }
      }
    });

    const missingLinks = deduped.map(j => j.link).filter(link => !map.has(link));
    if (missingLinks.length > 0) {
      const existing = await db.select({ id: jobs.id, jobLink: jobs.jobLink, fingerprint: jobs.fingerprint })
        .from(jobs)
        .where(and(eq(jobs.userId, userId), inArray(jobs.jobLink, missingLinks)));
      for (const row of existing) {
        if (row.id && row.jobLink) {
          map.set(row.jobLink, row.id);
        }
        if (row.id && row.fingerprint) {
          map.set(row.fingerprint, row.id);
        }
      }
    }
  } catch (err) {
    console.error(`Transaction failed in trackJobs for user ID ${userId}:`, err);
    throw err;
  }
  return map;
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
    fromDate?: string;
    toDate?: string;
    page?: number;
    limit?: number;
    minScore?: number;
  } = {}
) {
  await initDb();

  const page = Math.max(1, options.page || 1);
  const limit = Math.max(1, options.limit || 20);
  const offset = (page - 1) * limit;
  const minScore = options.minScore !== undefined ? options.minScore : 6;

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
        totalPages: 0,
        user: null
      };
    }
  }

  const conditions: SQL[] = [
    eq(jobs.userId, targetUserId)
  ];

  if (minScore > 0) {
    conditions.push(isNotNull(jobs.aiScore));
    conditions.push(gte(jobs.aiScore, minScore));
  }

  if (options.fromDate) {
    conditions.push(gte(jobs.createdAt, new Date(options.fromDate)));
  }
  if (options.toDate) {
    const endOfDay = new Date(options.toDate);
    endOfDay.setHours(23, 59, 59, 999);
    conditions.push(lte(jobs.createdAt, endOfDay));
  }

  const whereClause = and(...conditions);

  // Fetch total count
  const countResult = await db.select({ count: sql<number>`count(*)` })
    .from(jobs)
    .where(whereClause);

  const total = Number(countResult[0]?.count || 0);
  const totalPages = Math.ceil(total / limit);

  // Fetch paginated jobs for the date, ordered by score (highest first)
  const jobsList = await db.select()
    .from(jobs)
    .where(whereClause)
    .orderBy(desc(jobs.aiScore))
    .limit(limit)
    .offset(offset);

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

  return {
    jobs: jobsList,
    total,
    page,
    limit,
    totalPages,
    user: userResult[0] || null
  };
}

// ponytail: Get a single job by primary key UUID for ATS resume rendering
export async function getJobById(id: string) {
  await initDb();
  const rows = await db.select()
    .from(jobs)
    .where(eq(jobs.id, id))
    .limit(1);
  return rows[0] || null;
}

// ponytail: Cache newly generated ATS resume Markdown for a job
export async function updateJobResumeMd(jobId: string, resumeMd: string) {
  await initDb();
  await db.update(jobs)
    .set({ optimizedResumeMd: resumeMd })
    .where(eq(jobs.id, jobId));
}

// ─── Multi-Tenant Users & Subscription Helpers ────────────────────────────────

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

// Fetch minimal active user fields for fan-out orchestration, optionally filtered by tier
export async function getActiveUsersMinimal(tier?: string) {
  await initDb();
  const conditions: SQL[] = [eq(users.isActive, true)];
  if (tier) conditions.push(eq(users.tier, tier));
  return await db.select({
    id: users.id,
    email: users.email,
    isActive: users.isActive,
    telegramChatId: users.telegramChatId,
    tier: users.tier,
    subscriptionExpiresAt: users.subscriptionExpiresAt,
  }).from(users).where(and(...conditions));
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

// Create a new user record in database (7-day premium trial by default)
export async function createUser(userData: {
  email: string;
  name?: string;
  phone?: string;
  resumeText: string;
  telegramChatId?: string;
  linkedinCredentials?: { accessToken?: string; refreshToken?: string; personUrn?: string };
  tier?: string;
  subscriptionAmount?: number;
  subscriptionExpiresAt?: Date;
  excludeTitleKeywords?: string[];
  experienceYears?: number;
  linkedinProfileUrl?: string;
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
  phone: string;
  resumeText: string;
  telegramChatId: string;
  linkedinCredentials: { accessToken?: string; refreshToken?: string; personUrn?: string };
  tier: string;
  subscriptionAmount: number;
  subscriptionExpiresAt: Date;
  excludeTitleKeywords: string[];
  experienceYears: number;
  linkedinProfileUrl: string;
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

// Update user subscription tier, amount, and expiry date
export async function updateUserSubscription(
  userId: string,
  data: { tier: string; subscriptionAmount: number; subscriptionExpiresAt: string }
) {
  await initDb();
  return await db.update(users)
    .set({
      tier: data.tier,
      subscriptionAmount: data.subscriptionAmount,
      subscriptionExpiresAt: new Date(data.subscriptionExpiresAt),
      updatedAt: new Date()
    })
    .where(eq(users.id, userId))
    .returning();
}

// Downgrade user to free tier when premium subscription expires
export async function downgradeUserToFree(userId: string): Promise<boolean> {
  await initDb();
  const result = await db.update(users)
    .set({
      tier: Tier.FREE,
      subscriptionExpiresAt: null,
      updatedAt: new Date()
    })
    .where(and(
      eq(users.id, userId),
      eq(users.tier, Tier.PREMIUM)
    ))
    .returning();
  return result.length > 0;
}

/**
 * Checks if a premium user's subscription has expired.
 * If expired, downgrades the user to FREE tier in the DB, sends a Telegram notification,
 * updates the user object in memory, and returns true.
 * Returns false if the subscription is not expired.
 */
export async function checkAndHandleSubscriptionExpiry(user: any, botToken?: string): Promise<boolean> {
  if (user.tier === Tier.PREMIUM && user.subscriptionExpiresAt) {
    const now = new Date();
    const expiresAt = new Date(user.subscriptionExpiresAt);
    if (now > expiresAt) {
      console.log(`User ${user.id}: Premium subscription expired. Downgrading to free tier.`);
      const downgraded = await downgradeUserToFree(user.id);
      if (downgraded && user.telegramChatId && botToken) {
        const amountText = user.subscriptionAmount && user.subscriptionAmount > 0
          ? `₹${user.subscriptionAmount}/month`
          : 'Premium';
        const freeAlerts = TIER_CONFIG[Tier.FREE].alertsPerDay;
        await sendTelegramMessage(botToken, user.telegramChatId,
          `⏰ <b>Subscription Expired</b>\nYour ${amountText} subscription has ended. You're now on the free tier (${freeAlerts} alert/day).\nContact admin to renew.`
        );
      }
      user.tier = Tier.FREE;
      return true;
    }
  }
  return false;
}

// Log execution turn details into userRuns (no wallet deduction — subscription model)
export async function recordUserRun(
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
    llmInputTokens?: number;
    llmInputCacheHitTokens?: number;
    llmOutputTokens?: number;
    errorMessage?: string;
    exitStage?: string;
  }
) {
  await initDb();

  await db.transaction(async (tx) => {
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
      llmInputTokens: runData.llmInputTokens ?? 0,
      llmInputCacheHitTokens: runData.llmInputCacheHitTokens ?? 0,
      llmOutputTokens: runData.llmOutputTokens ?? 0,
      billedRunCostUsd: 0,
      errorMessage: runData.errorMessage,
      exitStage: runData.exitStage
    });

    if (runData.status === 'SUCCESS') {
      await tx.update(users)
        .set({
          totalRunsCount: sql`${users.totalRunsCount} + 1`,
          lastRunAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(users.id, userId));
    }
  });
}

// ─── Financial Analytics & Cost Dashboard Helpers ────────────────────────────

// Fetch aggregated metrics, profit analytics, subscription MRR, and monthly breakdown for Admin Dashboard
export async function getAnalyticsStats() {
  await initDb();

  // Aggregated user metrics natively in SQL
  const userCounts = await db.select({
    totalUsersCount: sql<number>`COUNT(*)`,
    activeUsersCount: sql<number>`COUNT(*) FILTER (WHERE ${users.isActive} = true)`,
    premiumUsersCount: sql<number>`COUNT(*) FILTER (WHERE ${users.tier} = ${Tier.PREMIUM})`,
    freeUsersCount: sql<number>`COUNT(*) FILTER (WHERE ${users.tier} = ${Tier.FREE})`
  }).from(users);

  const totalUsersCount = Number(userCounts[0]?.totalUsersCount || 0);
  const activeUsersCount = Number(userCounts[0]?.activeUsersCount || 0);
  const premiumUsersCount = Number(userCounts[0]?.premiumUsersCount || 0);
  const freeUsersCount = Number(userCounts[0]?.freeUsersCount || 0);

  // Subscription MRR (Monthly Recurring Revenue) from premium users
  const mrrResult = await db.select({
    mrr: sql<number>`COALESCE(SUM(${users.subscriptionAmount}), 0)`
  }).from(users).where(eq(users.tier, Tier.PREMIUM));
  const mrr = Number(mrrResult[0]?.mrr || 0);

  // Aggregate user_runs stats
  const runsStats = await db.select({
    totalRuns: sql<number>`COUNT(*)`,
    successfulRuns: sql<number>`COUNT(*) FILTER (WHERE ${userRuns.status} = 'SUCCESS')`,
    totalActualLlmCostUsd: sql<number>`COALESCE(SUM(${userRuns.actualLlmCostUsd}), 0)`
  }).from(userRuns);

  const stats = runsStats[0] || {
    totalRuns: 0,
    successfulRuns: 0,
    totalActualLlmCostUsd: 0
  };

  const totalActualCostUsd = Number(stats.totalActualLlmCostUsd);
  const totalProfitUsd = mrr - totalActualCostUsd;

  // Monthly breakdown of actual costs
  const monthlyStats = await db.select({
    month: sql<string>`TO_CHAR(${userRuns.runAt}, 'YYYY-MM')`,
    runsCount: sql<number>`COUNT(*)`,
    actualCostUsd: sql<number>`COALESCE(SUM(${userRuns.actualLlmCostUsd}), 0)`
  })
  .from(userRuns)
  .groupBy(sql`TO_CHAR(${userRuns.runAt}, 'YYYY-MM')`)
  .orderBy(sql`TO_CHAR(${userRuns.runAt}, 'YYYY-MM') DESC`);

  const formattedMonthly = monthlyStats.map((m: { month: string; runsCount: number; actualCostUsd: number }) => {
    const cost = Number(m.actualCostUsd);
    return {
      month: m.month,
      runsCount: Number(m.runsCount),
      actualCostUsd: cost,
      subscriptionRevenue: mrr,
      netProfitUsd: mrr - cost
    };
  });

  // Daily breakdown for the last 3 days (today, yesterday, day before)
  const dailyStats = await db.select({
    day: sql<string>`TO_CHAR(${userRuns.runAt} AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD')`,
    runsCount: sql<number>`COUNT(*)`,
    totalCostUsd: sql<number>`COALESCE(SUM(${userRuns.actualLlmCostUsd}), 0)`,
    minCostUsd: sql<number>`COALESCE(MIN(NULLIF(${userRuns.actualLlmCostUsd}, 0)), 0)`,
    maxCostUsd: sql<number>`COALESCE(MAX(${userRuns.actualLlmCostUsd}), 0)`
  })
  .from(userRuns)
  .where(gte(userRuns.runAt, sql`CURRENT_DATE - INTERVAL '3 days'`))
  .groupBy(sql`TO_CHAR(${userRuns.runAt} AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD')`)
  .orderBy(sql`TO_CHAR(${userRuns.runAt} AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') DESC`);

  const formattedDaily = dailyStats.map(d => ({
    day: d.day,
    runsCount: Number(d.runsCount),
    totalCostUsd: Number(d.totalCostUsd),
    minCostUsd: Number(d.minCostUsd),
    maxCostUsd: Number(d.maxCostUsd)
  }));

  // Jobs delivered grouped by source provider
  const jobsBySource = await db.select({
    source: sql<string>`COALESCE(${jobs.source}, 'unknown')`,
    count: sql<number>`COUNT(*)`
  })
  .from(jobs)
  .groupBy(sql`COALESCE(${jobs.source}, 'unknown')`)
  .orderBy(sql`COUNT(*) DESC`);

  const formattedJobsBySource = jobsBySource.map(s => ({
    source: s.source,
    count: Number(s.count)
  }));

  return {
    totalUsersCount,
    activeUsersCount,
    premiumUsersCount,
    freeUsersCount,
    mrr,
    totalRunsCount: Number(stats.totalRuns),
    successfulRunsCount: Number(stats.successfulRuns),
    totalActualCostUsd,
    totalProfitUsd,
    monthlyStats: formattedMonthly,
    dailyStats: formattedDaily,
    jobsBySource: formattedJobsBySource
  };
}

// ─── User Click Analytics Tracker ──────────────────────────────────────────────
export async function recordClickEvent(params: {
  jobId?: string;
  userId?: string;
  source: string;
  type: string;
}): Promise<boolean> {
  await initDb();

  let targetUserId = params.userId;

  if (!targetUserId && params.jobId) {
    const job = await getJobById(params.jobId);
    if (job) targetUserId = job.userId;
  }

  if (!targetUserId) return false;

  const key = `${params.source?.toLowerCase()}_${params.type?.toLowerCase()}`;

  switch (key) {
    case 'telegram_apply':
      await db.update(users)
        .set({ telegramApplyClicks: sql`${users.telegramApplyClicks} + 1` })
        .where(eq(users.id, targetUserId));
      break;
    case 'telegram_resume':
      await db.update(users)
        .set({ telegramResumeClicks: sql`${users.telegramResumeClicks} + 1` })
        .where(eq(users.id, targetUserId));
      break;
    case 'dashboard_apply':
      await db.update(users)
        .set({ dashboardApplyClicks: sql`${users.dashboardApplyClicks} + 1` })
        .where(eq(users.id, targetUserId));
      break;
    case 'dashboard_resume':
      await db.update(users)
        .set({ dashboardResumeClicks: sql`${users.dashboardResumeClicks} + 1` })
        .where(eq(users.id, targetUserId));
      break;
    default:
      return false;
  }

  return true;
}

