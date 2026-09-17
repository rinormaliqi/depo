import { and, eq, gt, isNull } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import { facilities, invites, locations, memberships, organizations, plans } from "@/db/schema";

async function getOrgPlan(organizationId: string) {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId));
  const [plan] = await db.select().from(plans).where(eq(plans.id, org.planId));
  return plan;
}

// A null limit column means unlimited (Enterprise) — see docs/pricing.md.
// Every check here is "current usage + what's about to be added", never
// "current usage alone", so a single action that would itself blow past the
// limit (applying a template with more bins than the plan allows, say) is
// caught in one query instead of only being caught bin-by-bin partway
// through the insert.

export async function assertCanAddBins(organizationId: string, additional: number) {
  if (additional <= 0) return;
  const plan = await getOrgPlan(organizationId);
  if (plan?.maxBins == null) return;

  const existing = await db
    .select({ id: locations.id })
    .from(locations)
    .innerJoin(facilities, eq(locations.facilityId, facilities.id))
    .where(and(eq(facilities.organizationId, organizationId), eq(locations.isBin, true)));

  if (existing.length + additional > plan.maxBins) {
    const t = await getTranslations("planLimit");
    throw new Error(t("bins", { max: plan.maxBins }));
  }
}

// Counts pending (unexpired, unaccepted) invites as seats already spoken
// for, not just accepted memberships — otherwise an org could invite far
// more people than its plan allows and only find out once some of them try
// to accept.
export async function assertCanAddSeats(organizationId: string, additional: number) {
  if (additional <= 0) return;
  const plan = await getOrgPlan(organizationId);
  if (plan?.maxUsers == null) return;

  const [memberRows, inviteRows] = await Promise.all([
    db.select({ id: memberships.id }).from(memberships).where(eq(memberships.organizationId, organizationId)),
    db
      .select({ id: invites.id })
      .from(invites)
      .where(and(eq(invites.organizationId, organizationId), isNull(invites.acceptedAt), gt(invites.expiresAt, new Date()))),
  ]);

  if (memberRows.length + inviteRows.length + additional > plan.maxUsers) {
    const t = await getTranslations("planLimit");
    throw new Error(t("users", { max: plan.maxUsers }));
  }
}

// Called by createFacility() in src/app/builder/actions.ts.
export async function assertCanAddFacilities(organizationId: string, additional: number) {
  if (additional <= 0) return;
  const plan = await getOrgPlan(organizationId);
  if (plan?.maxFacilities == null) return;

  const existing = await db.select({ id: facilities.id }).from(facilities).where(eq(facilities.organizationId, organizationId));

  if (existing.length + additional > plan.maxFacilities) {
    const t = await getTranslations("planLimit");
    throw new Error(t("facilities", { max: plan.maxFacilities }));
  }
}
