ALTER TABLE "users" ALTER COLUMN "resume_text" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "resume_s3_key" text;