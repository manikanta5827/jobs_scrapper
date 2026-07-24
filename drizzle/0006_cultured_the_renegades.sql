-- Drop previous primary key and unique constraint on jobs table
ALTER TABLE "jobs" DROP CONSTRAINT IF EXISTS "jobs_pkey";
ALTER TABLE "jobs" DROP CONSTRAINT IF EXISTS "jobs_job_link_pkey";
ALTER TABLE "jobs" DROP CONSTRAINT IF EXISTS "jobs_fingerprint_unique";

-- Add id primary key and user_id columns safely
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "id" serial PRIMARY KEY;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "user_id" integer;

-- Add foreign key constraint linking jobs to users table
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'jobs_user_id_users_id_fk') THEN
    ALTER TABLE "jobs" ADD CONSTRAINT "jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

-- Create composite index on user_id and job_link for candidate-level deduplication
CREATE UNIQUE INDEX IF NOT EXISTS "jobs_user_id_job_link_idx" ON "jobs" USING btree ("user_id","job_link");
CREATE INDEX IF NOT EXISTS "jobs_user_id_fingerprint_idx" ON "jobs" USING btree ("user_id","fingerprint");