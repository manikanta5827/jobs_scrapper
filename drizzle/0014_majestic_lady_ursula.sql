ALTER TABLE "users" ADD COLUMN "experience_years" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "target_roles" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "target_locations" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "employment_type" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "primary_domain" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "candidate_summary" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "known_skills" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "education" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "projects" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "certifications" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "key_highlights" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "suggested_job_titles" jsonb;