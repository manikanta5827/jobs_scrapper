import { pgTable, text, timestamp, serial, doublePrecision, integer, boolean, jsonb, index, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { Tier } from '../constants';

// Multi-tenant users table storing profile settings, credentials, and tier subscriptions
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(), // UUID primary key
  email: text("email").notNull().unique(), // Unique email identifier
  name: text("name"), // User full name
  phone: text("phone"), // Optional phone number
  resumeText: text("resume_text").notNull(), // Full plain text content of candidate's resume
  telegramChatId: text("telegram_chat_id"), // Candidate's Telegram chat ID (linked via /register <UUID>)
  linkedinCredentials: jsonb("linkedin_credentials").$type<{
    accessToken?: string;
    refreshToken?: string;
    personUrn?: string;
  }>(), // Optional LinkedIn OAuth details for automated posting
  linkedinPostTemplate: text("linkedin_post_template"), // Optional custom LinkedIn post template with {placeholders}
  
  // Subscription tier and billing
  tier: text("tier").default(Tier.PREMIUM).notNull(), // See Tier enum
  subscriptionAmount: doublePrecision("subscription_amount"), // Monthly subscription rate (nullable for free tier)
  subscriptionExpiresAt: timestamp("subscription_expires_at", { withTimezone: true }), // Premium expiry timestamp
  
  // Onboarding Candidate Preferences & Experience
  experienceYears: doublePrecision("experience_years").default(0).notNull(), // Candidate total experience in years (required)
  linkedinProfileUrl: text("linkedin_profile_url"), // Optional LinkedIn profile URL for tracking
  targetLocations: text("target_locations"), // Optional preferred locations (e.g. "Hyderabad, Remote")
  employmentType: text("employment_type"), // Optional employment type (e.g. "Full-time")

  // Structured Candidate AI Profile Columns
  primaryDomain: text("primary_domain"),
  candidateSummary: text("candidate_summary"),
  knownSkills: jsonb("known_skills").$type<string[]>(),
  education: jsonb("education").$type<string[]>(),
  projects: jsonb("projects").$type<Array<{ project_title: string; project_description: string }>>(),
  certifications: jsonb("certifications").$type<string[]>(),
  keyHighlights: jsonb("key_highlights").$type<string[]>(),
  suggestedJobTitles: jsonb("suggested_job_titles").$type<string[]>(),

  // Exclude-only keywords auto-generated via LLM during onboarding
  excludeTitleKeywords: jsonb("exclude_title_keywords").$type<string[]>().default([]).notNull(),

  isActive: boolean("is_active").default(true).notNull(), // User active state toggleable via Telegram /stop
  source: text("source"), // Acquisition source: 'linkedin' | 'whatsapp' | 'other'
  totalRunsCount: integer("total_runs_count").default(0).notNull(), // Lifetime completed runs count
  lastRunAt: timestamp("last_run_at", { withTimezone: true }), // Timestamp of last run

  // Analytics: Per-user button click metrics (Telegram vs Dashboard, Apply vs Resume)
  telegramApplyClicks: integer("telegram_apply_clicks").default(0).notNull(),
  telegramResumeClicks: integer("telegram_resume_clicks").default(0).notNull(),
  dashboardApplyClicks: integer("dashboard_apply_clicks").default(0).notNull(),
  dashboardResumeClicks: integer("dashboard_resume_clicks").default(0).notNull(),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  // Index on is_active to optimize getActiveUsers() queries
  index("users_is_active_idx").on(table.isActive),
  index("users_telegram_chat_id_idx").on(table.telegramChatId),
]);

// Per-candidate jobs table to track previously seen job postings strictly per user
export const jobs = pgTable("jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(), // User UUID reference
  jobLink: text("job_link").notNull(), // Job URL
  fingerprint: text("fingerprint"), // Job unique fingerprint string
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  jobTitle: text("job_title"),
  companyName: text("company_name"),
  location: text("location"),
  postedAt: text("posted_at"),
  salary: text("salary"),
  aiScore: integer("ai_score"),
  aiReason: text("ai_reason"),
  jobDomain: text("job_domain"),
  minRequiredYoe: doublePrecision("min_required_yoe"),
  maxRequiredYoe: doublePrecision("max_required_yoe"),
  requiredSkills: jsonb("required_skills").$type<string[]>().default([]).notNull(),
  preferredSkills: jsonb("preferred_skills").$type<string[]>().default([]).notNull(),
  candidateMatchedRequiredSkills: jsonb("candidate_matched_required_skills").$type<string[]>().default([]).notNull(),
  candidateMatchedPreferredSkills: jsonb("candidate_matched_preferred_skills").$type<string[]>().default([]).notNull(),
  candidateMissingRequiredSkills: jsonb("candidate_missing_required_skills").$type<string[]>().default([]).notNull(),
  candidateMissingPreferredSkills: jsonb("candidate_missing_preferred_skills").$type<string[]>().default([]).notNull(),
  domainMatchesCandidate: boolean("domain_matches_candidate").default(false).notNull(),
  aiJobLocation: text("ai_job_location"),
  directApply: text("direct_apply"),
  applicantsCount: text("applicants_count"),
  optimizedResumeMd: text("optimized_resume_md"),
  descriptionText: text("description_text"),
  source: text("source").default('linkedin'),
}, (table) => [
  // Composite unique index on user_id and job_link to prevent duplicate delivery per user
  uniqueIndex("jobs_user_id_job_link_idx").on(table.userId, table.jobLink),
  // Unique constraint on user_id and fingerprint to prevent duplicate jobs per user (also serves as lookup index)
  uniqueIndex("jobs_user_id_fingerprint_unique").on(table.userId, table.fingerprint),
  // Index on created_at for fast purging of old unmatched jobs
  index("jobs_created_at_idx").on(table.createdAt),
  // Composite index on user_id and created_at for fast paginated retrieval per user
  index("jobs_user_id_created_at_idx").on(table.userId, table.createdAt),
  // Composite index on user_id and ai_score for fast match queries
  index("jobs_user_id_ai_score_idx").on(table.userId, table.aiScore)
]);

// Per-run audit log recording stats and exact costs for every execution turn
export const userRuns = pgTable("user_runs", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(), // User UUID reference
  runAt: timestamp("run_at", { withTimezone: true }).defaultNow().notNull(), // Execution timestamp
  status: text("status").notNull(), // Status: 'SUCCESS' | 'SKIPPED_LOW_BALANCE' | 'SKIPPED_INACTIVE' | 'FAILED'
  
  // Scraped and filtered job counts (Sum equation: scraped = batchDedup + dbDedup + keywordFiltered + rejected + matched)
  scrapedJobsCount: integer("scraped_jobs_count").default(0).notNull(),
  batchDedupCount: integer("batch_dedup_count").default(0).notNull(),
  dbDedupCount: integer("db_dedup_count").default(0).notNull(),
  keywordFilteredCount: integer("keyword_filtered_count").default(0).notNull(),
  rejectedJobsCount: integer("rejected_jobs_count").default(0).notNull(),
  matchedJobsCount: integer("matched_jobs_count").default(0).notNull(),
  
  // Financial audit metrics
  actualLlmCostUsd: doublePrecision("actual_llm_cost_usd").default(0).notNull(), // Actual DeepSeek API cost incurred
  billedRunCostUsd: doublePrecision("billed_run_cost_usd").default(0).notNull(), // Deprecated: kept for historical data

  // LLM token usage per run
  llmInputTokens: integer("llm_input_tokens").default(0).notNull(), // Total LLM prompt/input tokens
  llmInputCacheHitTokens: integer("llm_input_cache_hit_tokens").default(0).notNull(), // LLM input tokens served from cache
  llmOutputTokens: integer("llm_output_tokens").default(0).notNull(), // LLM completion/output tokens
  
  errorMessage: text("error_message"), // Error message if run failed
  exitStage: text("exit_stage"), // Which filter stage the run ended at (e.g. "yoe_filter", "ai_evaluation")
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  // Composite index on user_id and run_at for fast audit queries and reporting per user
  index("user_runs_user_id_run_at_idx").on(table.userId, table.runAt)
]);

// ─── Inferred TypeScript Types ───────────────────────────────────────────────
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type JobRecord = typeof jobs.$inferSelect;
export type NewJobRecord = typeof jobs.$inferInsert;
export type UserRunRecord = typeof userRuns.$inferSelect;
