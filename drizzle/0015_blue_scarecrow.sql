CREATE TABLE "facility_underlays" (
	"facility_id" uuid PRIMARY KEY NOT NULL,
	"mime_type" text NOT NULL,
	"data" "bytea" NOT NULL,
	"width_px" integer NOT NULL,
	"height_px" integer NOT NULL,
	"scale" real NOT NULL,
	"offset_x_m" real DEFAULT 0 NOT NULL,
	"offset_y_m" real DEFAULT 0 NOT NULL,
	"opacity" real DEFAULT 0.6 NOT NULL,
	"visible" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "facility_underlays" ADD CONSTRAINT "facility_underlays_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE cascade ON UPDATE no action;