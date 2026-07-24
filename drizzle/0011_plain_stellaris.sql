ALTER TABLE "user_runs" ADD COLUMN "batch_dedup_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_runs" ADD COLUMN "db_dedup_count" integer DEFAULT 0 NOT NULL;