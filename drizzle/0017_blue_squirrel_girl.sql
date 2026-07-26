ALTER TABLE "users" ALTER COLUMN "experience_years" SET DATA TYPE double precision;--> statement-breakpoint
CREATE INDEX "jobs_created_at_idx" ON "jobs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "jobs_user_id_created_at_idx" ON "jobs" USING btree ("user_id","created_at");