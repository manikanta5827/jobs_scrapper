ALTER TABLE "users" ADD COLUMN "telegram_apply_clicks" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "telegram_resume_clicks" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "dashboard_apply_clicks" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "dashboard_resume_clicks" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "jobs_user_id_ai_score_idx" ON "jobs" USING btree ("user_id","ai_score");