CREATE TABLE "key_rotation" (
	"id" serial PRIMARY KEY NOT NULL,
	"api_key" text NOT NULL,
	"usage_cost" double precision DEFAULT 0,
	"subscription_start_date" date NOT NULL,
	"is_expired" boolean DEFAULT false,
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "key_rotation_api_key_unique" UNIQUE("api_key")
);
--> statement-breakpoint
DROP TABLE "matched_jobs" CASCADE;