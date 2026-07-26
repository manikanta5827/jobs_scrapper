ALTER TABLE "jobs" ADD COLUMN "matched_skills" jsonb;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "missing_skills" jsonb;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "required_yoe" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "direct_apply" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "applicants_count" text;