"use server";

import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { memberships, organizations, payments, plans } from "@/db/schema";
import { BILLING_CURRENCY, applyPaidPayment, priceForPeriod } from "@/lib/billing";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { attempt } from "@/lib/action-result";

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

async function updateOrgBillingImpl(
  orgId: string,
  patch: {
    planId?: string;
    subscriptionStatus?: "trialing" | "active" | "past_due" | "canceled";
    trialEndsAt?: string | null;
    paidUntil?: string | null;
  },
) {
  await requirePlatformAdmin();

  const values: Partial<typeof organizations.$inferInsert> = {};
  if (patch.planId) values.planId = patch.planId;
  if (patch.subscriptionStatus) values.subscriptionStatus = patch.subscriptionStatus;
  if (patch.trialEndsAt !== undefined) values.trialEndsAt = patch.trialEndsAt ? new Date(patch.trialEndsAt) : null;
  if (patch.paidUntil !== undefined) values.paidUntil = patch.paidUntil ? new Date(patch.paidUntil) : null;

  if (Object.keys(values).length > 0) {
    await db.update(organizations).set(values).where(eq(organizations.id, orgId));
  }
  revalidatePath("/internal");
}

// The bank-transfer path: the founder saw the money land and records it
// here. Goes through the same applyPaidPayment() as a Paysera callback,
// so the period maths and the audit row are identical either way.
async function recordManualPaymentImpl(orgId: string, input: { planId: string; months: number; amountCents?: number; note?: string }) {
  await requirePlatformAdmin();
  if (!Number.isInteger(input.months) || input.months <= 0) throw new Error("months must be a positive integer");

  const [plan] = await db.select().from(plans).where(eq(plans.id, input.planId));
  if (!plan) throw new Error("Unknown plan");

  const [payment] = await db
    .insert(payments)
    .values({
      organizationId: orgId,
      planId: plan.id,
      months: input.months,
      amountCents: input.amountCents ?? priceForPeriod(plan, input.months),
      currency: BILLING_CURRENCY,
      status: "pending",
      provider: "manual",
      note: input.note?.trim() || null,
    })
    .returning();
  await applyPaidPayment(payment.id);
  revalidatePath("/internal");
}

export async function listRecentPayments() {
  await requirePlatformAdmin();
  return db.select().from(payments).orderBy(desc(payments.createdAt)).limit(50);
}

export async function updateOrgBilling(
  orgId: string,
  patch: {
    planId?: string;
    subscriptionStatus?: "trialing" | "active" | "past_due" | "canceled";
    trialEndsAt?: string | null;
    paidUntil?: string | null;
  },
) {
  return attempt(() => updateOrgBillingImpl(orgId, patch));
}

export async function recordManualPayment(orgId: string, input: { planId: string; months: number; amountCents?: number; note?: string }) {
  return attempt(() => recordManualPaymentImpl(orgId, input));
}
