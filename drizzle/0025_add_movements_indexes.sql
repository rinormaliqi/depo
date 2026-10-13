DROP INDEX "movements_org_idx";--> statement-breakpoint
CREATE INDEX "movements_org_created_idx" ON "movements" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "movements_from_location_idx" ON "movements" USING btree ("from_location_id");--> statement-breakpoint
CREATE INDEX "movements_to_location_idx" ON "movements" USING btree ("to_location_id");--> statement-breakpoint
CREATE INDEX "movements_item_idx" ON "movements" USING btree ("item_id");