ALTER TABLE "jobs" RENAME COLUMN "seen_at" TO "created_at";--> statement-breakpoint
ALTER TABLE "key_rotation" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "key_rotation" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "user_runs" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "user_runs" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;