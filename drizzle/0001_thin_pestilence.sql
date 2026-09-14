ALTER TABLE "locations" ADD COLUMN "levels" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "bay" integer;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "level" integer;