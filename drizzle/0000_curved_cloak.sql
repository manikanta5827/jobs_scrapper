CREATE TABLE "jobs" (
	"job_link" text PRIMARY KEY NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "matched_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_link" text NOT NULL,
	"job_title" text,
	"company_name" text,
	"company_website" text,
	"posted_at" text,
	"salary" text,
	"applicants_count" text,
	"apply_url" text,
	"ai_score" integer DEFAULT 0,
	"ai_reason" text,
	"ai_matched_skills" text,
	"ai_missing_skills" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"applied" boolean DEFAULT false,
	"notes" text,
	CONSTRAINT "matched_jobs_job_link_unique" UNIQUE("job_link")
);
--> statement-breakpoint
CREATE INDEX "idx_jobs_ai_score" ON "matched_jobs" USING btree ("ai_score");--> statement-breakpoint
CREATE INDEX "idx_jobs_created" ON "matched_jobs" USING btree ("created_at");