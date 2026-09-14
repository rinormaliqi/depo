"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { facilities, locations, memberships, organizations, plans } from "@/db/schema";
import { requireSession } from "@/lib/session";

export async function getMyBilling() {
  const session = await requireSession();

  const [org] = await db.select().from(organizations).where(eq(organizations.id, session.organizationId));
  const [plan] = await db.select().from(plans).where(eq(plans.id, org.planId));

  const [memberRows, facilityRows] = await Promise.all([
    db.select({ id: memberships.id }).from(memberships).where(eq(memberships.organizationId, session.organizationId)),
    db.select({ id: facilities.id }).from(facilities).where(eq(facilities.organizationId, session.organizationId)),
  ]);

  const binRows = await db
    .select({ id: locations.id })
    .from(locations)
    .innerJoin(facilities, eq(locations.facilityId, facilities.id))
    .where(and(eq(facilities.organizationId, session.organizationId), eq(locations.isBin, true)));

  return {
    org,
    plan,
    usage: { users: memberRows.length, facilities: facilityRows.length, bins: binRows.length },
  };
}

// A lighter query for the header's trial pill — avoid the usage-count joins
// above on every single page load just to show a plan/trial badge.
export async function getBillingSummary() {
  const session = await requireSession();
  const [org] = await db.select().from(organizations).where(eq(organizations.id, session.organizationId));
  const [plan] = await db.select().from(plans).where(eq(plans.id, org.planId));
  return {
    subscriptionStatus: org.subscriptionStatus,
    trialEndsAt: org.trialEndsAt,
    planName: plan?.name ?? null,
  };
}
