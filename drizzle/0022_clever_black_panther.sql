DROP INDEX "jobs_user_id_fingerprint_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_user_id_fingerprint_unique" ON "jobs" USING btree ("user_id","fingerprint");