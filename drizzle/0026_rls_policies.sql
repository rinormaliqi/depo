-- Row-level security, phase 1 (#228): the policies exist and are enabled,
-- but nothing the app does changes yet. The app connects as the tables'
-- owner, and an owner bypasses RLS unless it is FORCEd (it isn't). The
-- policies apply to `app_user`, which code opts into per transaction:
--
--   begin;
--   set local role app_user;
--   select set_config('app.org_id', '<org uuid>', true);
--   select set_config('app.user_id', '<user uuid>', true);
--   ...
--   commit;
--
-- With no org set, every policy below matches nothing: deny by default.

-- The current tenant, from the transaction's settings. nullif: a pooled
-- connection that ran a set_config(..., true) earlier reads back '' (not
-- NULL) once that transaction is over, and ''::uuid would be an error.
CREATE OR REPLACE FUNCTION app_current_org_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.org_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_current_user_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;
--> statement-breakpoint

-- Roles are cluster-wide, so a second database on the same server (dev and
-- test locally) finds it already there.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN;
  END IF;
END
$$;
--> statement-breakpoint
-- Lets the app's own login role `SET ROLE app_user`.
GRANT app_user TO CURRENT_USER;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO app_user;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
--> statement-breakpoint
-- Tables later migrations create are granted too (this covers objects
-- created by the role running migrations, which is the one running this).
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_user;
--> statement-breakpoint

-- Tables that carry organization_id themselves.
ALTER TABLE "facilities" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "facilities" TO app_user
  USING (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());
--> statement-breakpoint
ALTER TABLE "items" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "items" TO app_user
  USING (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());
--> statement-breakpoint
ALTER TABLE "movements" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "movements" TO app_user
  USING (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());
--> statement-breakpoint
ALTER TABLE "item_custom_field_definitions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "item_custom_field_definitions" TO app_user
  USING (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());
--> statement-breakpoint
ALTER TABLE "inventory_settings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "inventory_settings" TO app_user
  USING (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());
--> statement-breakpoint
ALTER TABLE "invites" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "invites" TO app_user
  USING (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());
--> statement-breakpoint
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "payments" TO app_user
  USING (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());
--> statement-breakpoint
ALTER TABLE "contracts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "contracts" TO app_user
  USING (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());
--> statement-breakpoint
-- A person also sees their own memberships in other companies: the
-- company switcher lists them. Writing one is still current-company only.
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "memberships" TO app_user
  USING (organization_id = app_current_org_id() OR user_id = app_current_user_id())
  WITH CHECK (organization_id = app_current_org_id());
--> statement-breakpoint

-- Tables that belong to a company through their facility or item.
ALTER TABLE "locations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "locations" TO app_user
  USING (EXISTS (SELECT 1 FROM facilities f WHERE f.id = locations.facility_id AND f.organization_id = app_current_org_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM facilities f WHERE f.id = locations.facility_id AND f.organization_id = app_current_org_id()));
--> statement-breakpoint
ALTER TABLE "facility_levels" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "facility_levels" TO app_user
  USING (EXISTS (SELECT 1 FROM facilities f WHERE f.id = facility_levels.facility_id AND f.organization_id = app_current_org_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM facilities f WHERE f.id = facility_levels.facility_id AND f.organization_id = app_current_org_id()));
--> statement-breakpoint
ALTER TABLE "facility_underlays" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "facility_underlays" TO app_user
  USING (EXISTS (SELECT 1 FROM facilities f WHERE f.id = facility_underlays.facility_id AND f.organization_id = app_current_org_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM facilities f WHERE f.id = facility_underlays.facility_id AND f.organization_id = app_current_org_id()));
--> statement-breakpoint
ALTER TABLE "item_custom_field_values" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "item_custom_field_values" TO app_user
  USING (EXISTS (SELECT 1 FROM items i WHERE i.id = item_custom_field_values.item_id AND i.organization_id = app_current_org_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM items i WHERE i.id = item_custom_field_values.item_id AND i.organization_id = app_current_org_id()));
--> statement-breakpoint
-- Stock is read through its item; a write must also land in a bin of the
-- same company, so an item can't be stocked into someone else's shelf.
ALTER TABLE "stock" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "stock" TO app_user
  USING (EXISTS (SELECT 1 FROM items i WHERE i.id = stock.item_id AND i.organization_id = app_current_org_id()))
  WITH CHECK (
    EXISTS (SELECT 1 FROM items i WHERE i.id = stock.item_id AND i.organization_id = app_current_org_id())
    AND EXISTS (
      SELECT 1 FROM locations l JOIN facilities f ON f.id = l.facility_id
      WHERE l.id = stock.location_id AND f.organization_id = app_current_org_id()
    )
  );
