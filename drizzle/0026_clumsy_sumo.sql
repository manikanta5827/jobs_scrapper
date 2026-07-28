ALTER TABLE "user_runs" ADD COLUMN "llm_input_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_runs" ADD COLUMN "llm_input_cache_hit_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_runs" ADD COLUMN "llm_output_tokens" integer DEFAULT 0 NOT NULL;