CREATE TABLE "user_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text NOT NULL,
	"scraped_jobs_count" integer DEFAULT 0 NOT NULL,
	"new_jobs_count" integer DEFAULT 0 NOT NULL,
	"keyword_filtered_count" integer DEFAULT 0 NOT NULL,
	"matched_jobs_count" integer DEFAULT 0 NOT NULL,
	"rejected_jobs_count" integer DEFAULT 0 NOT NULL,
	"actual_llm_cost_usd" double precision DEFAULT 0 NOT NULL,
	"actual_apify_cost_usd" double precision DEFAULT 0 NOT NULL,
	"billed_run_cost_usd" double precision DEFAULT 0.05 NOT NULL,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"resume_text" text NOT NULL,
	"linkedin_search_urls" jsonb NOT NULL,
	"telegram_chat_id" text NOT NULL,
	"linkedin_credentials" jsonb,
	"balance_usd" double precision DEFAULT 0 NOT NULL,
	"custom_run_cost_usd" double precision,
	"exclude_title_keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"total_llm_cost_usd" double precision DEFAULT 0 NOT NULL,
	"total_runs_count" integer DEFAULT 0 NOT NULL,
	"last_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "user_runs" ADD CONSTRAINT "user_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_runs_user_id_run_at_idx" ON "user_runs" USING btree ("user_id","run_at");--> statement-breakpoint
CREATE INDEX "users_is_active_idx" ON "users" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "users_telegram_chat_id_idx" ON "users" USING btree ("telegram_chat_id");--> statement-breakpoint
CREATE INDEX "key_rotation_usage_cost_idx" ON "key_rotation" USING btree ("usage_cost");