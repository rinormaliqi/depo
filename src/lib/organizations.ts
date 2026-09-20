import { desc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { memberships, organizations, type MembershipRole } from "@/db/schema";

// Which organization a user is acting in. One person can belong to
// several (a contractor who is a worker at one depot and admin of their
// own), so "current organization" is an explicit, per-browser choice kept
// in a cookie like the facility and the locale — validated against the
// user's memberships on every read, defaulting to the most recently
// joined one (which is what a freshly accepted invite should land in).
// Before this, the first membership row won silently (#74).
export const organizationCookieName = "smartdepo_org";

export type MyOrganization = { id: string; name: string; role: MembershipRole; joinedAt: Date };

export async function listMyOrganizations(userId: string): Promise<MyOrganization[]> {
  return db
    .select({ id: organizations.id, name: organizations.name, role: memberships.role, joinedAt: memberships.createdAt })
    .from(memberships)
    .innerJoin(organizations, eq(memberships.organizationId, organizations.id))
    .where(eq(memberships.userId, userId))
    .orderBy(desc(memberships.createdAt));
}

export async function currentOrganization(userId: string): Promise<MyOrganization | null> {
  const all = await listMyOrganizations(userId);
  if (all.length === 0) return null;
  const wanted = (await cookies()).get(organizationCookieName)?.value;
  return all.find((o) => o.id === wanted) ?? all[0];
}

export async function rememberOrganization(organizationId: string) {
  (await cookies()).set(organizationCookieName, organizationId, { maxAge: 60 * 60 * 24 * 365, path: "/" });
}
