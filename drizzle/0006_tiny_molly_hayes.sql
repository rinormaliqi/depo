ALTER TABLE "plans" ADD COLUMN "features" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
-- Every existing plan includes every feature today (docs/pricing.md); a
-- missing key reads as "not included", so the rows must not be left at {}.
UPDATE "plans" SET "features" = '{"printLabels": true, "cameraScanning": true, "viewMetrics": true}'::jsonb WHERE "features" = '{}'::jsonb;
