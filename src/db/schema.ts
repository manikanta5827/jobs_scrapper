import { pgTable, text, timestamp, serial, integer, boolean, index } from "drizzle-orm/pg-core";

export const jobs = pgTable("jobs", {
  jobLink: text("job_link").primaryKey(),
  seenAt: timestamp("seen_at", { withTimezone: true }).defaultNow(),
});

export const matchedJobs = pgTable("matched_jobs", {
  id: serial("id").primaryKey(),
  jobLink: text("job_link").notNull().unique(),
  jobTitle: text("job_title"),
  companyName: text("company_name"),
  companyWebsite: text("company_website"),
  postedAt: text("posted_at"),
  salary: text("salary"),
  applicantsCount: text("applicants_count"),
  applyUrl: text("apply_url"),
  aiScore: integer("ai_score").default(0),
  aiReason: text("ai_reason"),
  aiMatchedSkills: text("ai_matched_skills"), // JSON array stored as text
  aiMissingSkills: text("ai_missing_skills"), // JSON array stored as text
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  applied: boolean("applied").default(false),
  notes: text("notes"),
}, (table) => {
  return {
    aiScoreIndex: index("idx_jobs_ai_score").on(table.aiScore),
    createdAtIndex: index("idx_jobs_created").on(table.createdAt),
  };
});
