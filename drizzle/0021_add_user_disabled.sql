ALTER TABLE "users" ADD COLUMN "disabled_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "disabled_reason" text;