ALTER TABLE "user_runs" ALTER COLUMN "billed_run_cost_usd" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "tier" text DEFAULT 'premium' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "subscription_amount" double precision;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "subscription_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "balance_usd";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "custom_run_cost_usd";