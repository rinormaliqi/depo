CREATE TABLE "inventory_settings" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"consumption_window_days" integer DEFAULT 30 NOT NULL,
	"warn_cover_days" integer DEFAULT 14 NOT NULL,
	"fallback_warn_ratio" real DEFAULT 1.5 NOT NULL,
	"outflow_reasons" jsonb DEFAULT '["sale","pick","remove"]'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "max_stock_level" integer;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "warn_days" integer;--> statement-breakpoint
ALTER TABLE "inventory_settings" ADD CONSTRAINT "inventory_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;