CREATE TABLE "facility_levels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"facility_id" uuid NOT NULL,
	"index" integer NOT NULL,
	"name" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "facility_levels" ADD CONSTRAINT "facility_levels_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "facility_levels_facility_index_idx" ON "facility_levels" USING btree ("facility_id","index");--> statement-breakpoint
-- Backfill: every existing facility gets at least two levels, or as many
-- as its tallest rack already uses, so nothing an admin drew disappears.
INSERT INTO "facility_levels" ("facility_id", "index")
SELECT f.id, gs.i
FROM "facilities" f
CROSS JOIN LATERAL generate_series(1, GREATEST(2, COALESCE((SELECT MAX(l.levels) FROM "locations" l WHERE l.facility_id = f.id), 1))) AS gs(i)
ON CONFLICT DO NOTHING;
