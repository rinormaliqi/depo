import { asc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { facilities } from "@/db/schema";

// Which facility a user is "in" is a per-browser preference, kept in a
// cookie exactly like the locale (not on the membership row): the same
// admin can have the depot open on a desk monitor and a different site's
// scanner open on a phone at the same time. The cookie only ever holds a
// facility id; it's validated against the org on every read, so a stale
// or forged value just falls back to the first facility.
export const facilityCookieName = "smartdepo_facility";

export async function listFacilities(organizationId: string) {
  return db.select().from(facilities).where(eq(facilities.organizationId, organizationId)).orderBy(asc(facilities.createdAt));
}

export async function currentFacility(organizationId: string) {
  const all = await listFacilities(organizationId);
  if (all.length === 0) return null;
  const wanted = (await cookies()).get(facilityCookieName)?.value;
  return all.find((f) => f.id === wanted) ?? all[0];
}

export async function rememberFacility(facilityId: string) {
  (await cookies()).set(facilityCookieName, facilityId, { maxAge: 60 * 60 * 24 * 365, path: "/" });
}
