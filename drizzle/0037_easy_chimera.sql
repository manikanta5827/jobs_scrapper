DROP INDEX "jobs_created_at_idx";--> statement-breakpoint
DROP INDEX "jobs_user_id_created_at_idx";--> statement-breakpoint
ALTER TABLE "jobs" DROP COLUMN "optimized_resume_md";--> statement-breakpoint
ALTER TABLE "jobs" DROP COLUMN "description_text";