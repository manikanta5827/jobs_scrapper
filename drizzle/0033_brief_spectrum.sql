ALTER TABLE "jobs" ALTER COLUMN "matched_skills" SET DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "jobs" ALTER COLUMN "missing_skills" SET DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "job_domain" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "min_required_yoe" integer;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "max_required_yoe" integer;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "required_skills" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "preferred_skills" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "candidate_matched_required_skills" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "candidate_matched_preferred_skills" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "candidate_missing_required_skills" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "candidate_missing_preferred_skills" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "domain_matches_candidate" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "ai_job_location" text;