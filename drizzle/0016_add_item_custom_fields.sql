CREATE TABLE "item_custom_field_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"type" text NOT NULL,
	"options" jsonb,
	"required" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_custom_field_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"field_definition_id" uuid NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "item_custom_field_definitions" ADD CONSTRAINT "item_custom_field_definitions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_custom_field_values" ADD CONSTRAINT "item_custom_field_values_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_custom_field_values" ADD CONSTRAINT "item_custom_field_values_field_definition_id_item_custom_field_definitions_id_fk" FOREIGN KEY ("field_definition_id") REFERENCES "public"."item_custom_field_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "item_custom_field_definitions_org_idx" ON "item_custom_field_definitions" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "item_custom_field_definitions_org_key_idx" ON "item_custom_field_definitions" USING btree ("organization_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "item_custom_field_values_item_field_idx" ON "item_custom_field_values" USING btree ("item_id","field_definition_id");--> statement-breakpoint
CREATE INDEX "item_custom_field_values_field_idx" ON "item_custom_field_values" USING btree ("field_definition_id");