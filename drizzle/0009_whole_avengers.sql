-- Update users table primary key and foreign key references to UUID type
ALTER TABLE "jobs" DROP CONSTRAINT IF EXISTS "jobs_user_id_users_id_fk";
ALTER TABLE "user_runs" DROP CONSTRAINT IF EXISTS "user_runs_user_id_users_id_fk";

-- Drop old serial sequence default on users.id before altering data type
ALTER TABLE "users" ALTER COLUMN "id" DROP DEFAULT;

-- Alter column types to UUID deterministically using lpad to preserve foreign key relationships
ALTER TABLE "users" ALTER COLUMN "id" SET DATA TYPE uuid USING lpad(to_hex(id), 32, '0')::uuid;
ALTER TABLE "users" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "jobs" ALTER COLUMN "user_id" SET DATA TYPE uuid USING lpad(to_hex(user_id), 32, '0')::uuid;
ALTER TABLE "user_runs" ALTER COLUMN "user_id" SET DATA TYPE uuid USING lpad(to_hex(user_id), 32, '0')::uuid;
ALTER TABLE "user_runs" ALTER COLUMN "billed_run_cost_usd" DROP DEFAULT;

-- Re-add foreign key constraints
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "user_runs" ADD CONSTRAINT "user_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;