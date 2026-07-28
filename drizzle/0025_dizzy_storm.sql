-- Zero-data-loss migration: serial id → uuid with gen_random_uuid()
-- No foreign keys reference jobs.id, so no CASCADE concerns

-- Step 1: Drop primary key constraint
ALTER TABLE "jobs" DROP CONSTRAINT "jobs_pkey";

-- Step 2: Add new UUID column with auto-generated default
ALTER TABLE "jobs" ADD COLUMN "new_id" uuid DEFAULT gen_random_uuid() NOT NULL;

-- Step 3: Drop old serial id column
ALTER TABLE "jobs" DROP COLUMN "id";

-- Step 4: Rename new_id to id
ALTER TABLE "jobs" RENAME COLUMN "new_id" TO "id";

-- Step 5: Restore primary key constraint
ALTER TABLE "jobs" ADD PRIMARY KEY ("id");
