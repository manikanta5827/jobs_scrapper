ALTER TABLE "jobs" ADD COLUMN "fingerprint" text;--> statement-breakpoint
ALTER TABLE "matched_jobs" ADD COLUMN "fingerprint" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_fingerprint_unique" UNIQUE("fingerprint");--> statement-breakpoint
ALTER TABLE "matched_jobs" ADD CONSTRAINT "matched_jobs_fingerprint_unique" UNIQUE("fingerprint");