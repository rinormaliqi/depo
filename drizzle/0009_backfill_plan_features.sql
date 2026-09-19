-- Re-run the 0006 backfill: production applied 0006 before its UPDATE was
-- appended (a preview build ran migrations against the live database), so
-- every plan was left with an empty feature map. Idempotent.
UPDATE "plans" SET "features" = '{"printLabels": true, "cameraScanning": true, "viewMetrics": true}'::jsonb WHERE "features" = '{}'::jsonb;
