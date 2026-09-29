CREATE TABLE "admin_view_as_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"ended_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "contact_messages" ADD COLUMN "handled_at" timestamp;--> statement-breakpoint
ALTER TABLE "admin_view_as_sessions" ADD CONSTRAINT "admin_view_as_sessions_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_view_as_sessions" ADD CONSTRAINT "admin_view_as_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_view_as_sessions_admin_idx" ON "admin_view_as_sessions" USING btree ("admin_user_id");