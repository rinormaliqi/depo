-- A company that already typed the same SKU twice keeps both items: the
-- later ones get a "-2", "-3" suffix so the unique index below can be
-- created; the admin can fix the names on /items afterwards.
UPDATE "items" AS i
SET "sku" = i."sku" || '-' || d.n
FROM (
  SELECT "id", row_number() OVER (PARTITION BY "organization_id", "sku" ORDER BY "created_at", "id") AS n
  FROM "items"
  WHERE "sku" IS NOT NULL
) AS d
WHERE d."id" = i."id" AND d.n > 1;--> statement-breakpoint
CREATE UNIQUE INDEX "items_org_sku_idx" ON "items" USING btree ("organization_id","sku") WHERE "items"."sku" is not null;
