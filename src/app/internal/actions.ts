"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { memberships, organizations, plans } from "@/db/schema";
import { requirePlatformAdmin } from "@/lib/platform-admin";

export async function listOrganizations() {
  await requirePlatformAdmin();

  const [orgs, allPlans, allMemberships] = await Promise.all([
    db.select().from(organizations).orderBy(organizations.createdAt),
    db.select().from(plans),
    db.select({ organizationId: memberships.organizationId }).from(memberships),
  ]);

  const planById = new Map(allPlans.map((p) => [p.id, p]));
  const memberCounts = new Map<string, number>();
  for (const m of allMemberships) memberCounts.set(m.organizationId, (memberCounts.get(m.organizationId) ?? 0) + 1);

  return {
    organizations: orgs.map((o) => ({
      ...o,
      planKey: planById.get(o.planId)?.key ?? null,
      memberCount: memberCounts.get(o.id) ?? 0,
    })),
    plans: allPlans,
  };
}

export async function updateOrgBilling(
  orgId: string,
  patch: {
    planId?: string;
    subscriptionStatus?: "trialing" | "active" | "past_due" | "canceled";
    trialEndsAt?: string | null;
  },
) {
  await requirePlatformAdmin();

  const values: Partial<typeof organizations.$inferInsert> = {};
  if (patch.planId) values.planId = patch.planId;
  if (patch.subscriptionStatus) values.subscriptionStatus = patch.subscriptionStatus;
  if (patch.trialEndsAt !== undefined) values.trialEndsAt = patch.trialEndsAt ? new Date(patch.trialEndsAt) : null;

  if (Object.keys(values).length > 0) {
    await db.update(organizations).set(values).where(eq(organizations.id, orgId));
  }
  revalidatePath("/internal");
}
