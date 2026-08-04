CREATE INDEX "jobs_user_id_created_at_idx" ON "jobs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "jobs_created_at_idx" ON "jobs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "users_is_active_tier_idx" ON "users" USING btree ("is_active","tier");--> statement-breakpoint
CREATE INDEX "users_tier_sub_expires_at_active_idx" ON "users" USING btree ("tier","subscription_expires_at","is_active");