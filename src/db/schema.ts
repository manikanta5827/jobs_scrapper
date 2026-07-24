import { pgTable, text, timestamp, serial, doublePrecision, date, integer, boolean, jsonb, index, uniqueIndex, uuid } from "drizzle-orm/pg-core";

// Multi-tenant users table storing profile settings, credentials, and wallet balance
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(), // UUID primary key
  email: text("email").notNull().unique(), // Unique email identifier
  name: text("name"), // User full name
  resumeText: text("resume_text").notNull(), // Full plain text content of candidate's resume
  linkedinSearchUrls: jsonb("linkedin_search_urls").$type<string[]>().notNull(), // Array of LinkedIn search URLs to scrape
  telegramChatId: text("telegram_chat_id"), // Candidate's Telegram chat ID (linked via /register <UUID>)
  linkedinCredentials: jsonb("linkedin_credentials").$type<{
    accessToken?: string;
    refreshToken?: string;
    personUrn?: string;
  }>(), // Optional LinkedIn OAuth details for automated posting
  
  // Wallet balance and custom run rate overrides
  balanceUsd: doublePrecision("balance_usd").default(0.0).notNull(), // Prepaid balance in USD
  customRunCostUsd: doublePrecision("custom_run_cost_usd"), // Optional custom cost override per run
  
  // Exclude-only keywords auto-generated via LLM during onboarding
  excludeTitleKeywords: jsonb("exclude_title_keywords").$type<string[]>().default([]).notNull(),

  isActive: boolean("is_active").default(true).notNull(), // User active state toggleable via Telegram /stop
  totalRunsCount: integer("total_runs_count").default(0).notNull(), // Lifetime completed runs count
  lastRunAt: timestamp("last_run_at", { withTimezone: true }), // Timestamp of last run
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  // Index on is_active to optimize getActiveUsers() queries
  index("users_is_active_idx").on(table.isActive),
  index("users_telegram_chat_id_idx").on(table.telegramChatId),
]);

// Per-candidate jobs table to track previously seen job postings strictly per user
export const jobs = pgTable("jobs", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(), // User UUID reference
  jobLink: text("job_link").notNull(), // Job URL
  fingerprint: text("fingerprint"), // Job unique fingerprint string
  seenAt: timestamp("seen_at", { withTimezone: true }).defaultNow(), // Timestamp job was first processed for user
}, (table) => [
  // Composite unique index on user_id and job_link to prevent duplicate delivery per user
  uniqueIndex("jobs_user_id_job_link_idx").on(table.userId, table.jobLink),
  // Index on user_id and fingerprint for fast deduplication lookup per user
  index("jobs_user_id_fingerprint_idx").on(table.userId, table.fingerprint)
]);

// Shared key rotation table for rotating Apify API tokens across accounts
export const keyRotation = pgTable("key_rotation", {
  id: serial("id").primaryKey(),
  apiKey: text("api_key").notNull().unique(),
  usageCost: doublePrecision("usage_cost").default(0), // Accumulated cost in $
  name: text("name"), // Friendly name for the account token
  subscriptionStartDate: date("subscription_start_date").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  // Index on usage_cost to speed up active token selection (WHERE usage_cost < 5.00 ORDER BY usage_cost DESC)
  index("key_rotation_usage_cost_idx").on(table.usageCost)
]);

// Per-run audit log recording stats and exact costs for every execution turn
export const userRuns = pgTable("user_runs", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(), // User UUID reference
  runAt: timestamp("run_at", { withTimezone: true }).defaultNow().notNull(), // Execution timestamp
  status: text("status").notNull(), // Status: 'SUCCESS' | 'SKIPPED_LOW_BALANCE' | 'SKIPPED_INACTIVE' | 'FAILED'
  
  // Scraped and filtered job counts
  scrapedJobsCount: integer("scraped_jobs_count").default(0).notNull(),
  newJobsCount: integer("new_jobs_count").default(0).notNull(),
  keywordFilteredCount: integer("keyword_filtered_count").default(0).notNull(),
  matchedJobsCount: integer("matched_jobs_count").default(0).notNull(),
  rejectedJobsCount: integer("rejected_jobs_count").default(0).notNull(),
  
  // Financial audit metrics
  actualLlmCostUsd: doublePrecision("actual_llm_cost_usd").default(0).notNull(), // Actual DeepSeek API cost incurred
  actualApifyCostUsd: doublePrecision("actual_apify_cost_usd").default(0).notNull(), // Actual Apify API cost incurred
  billedRunCostUsd: doublePrecision("billed_run_cost_usd").notNull(), // Flat fee charged to user wallet
  
  errorMessage: text("error_message"), // Error message if run failed
}, (table) => [
  // Composite index on user_id and run_at for fast audit queries and reporting per user
  index("user_runs_user_id_run_at_idx").on(table.userId, table.runAt)
]);
