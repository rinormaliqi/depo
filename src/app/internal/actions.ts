"use server";

import { count, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { adminAuditLog, facilities, items, memberships, movements, organizations, payments, plans, users } from "@/db/schema";
import { BILLING_CURRENCY, applyPaidPayment, priceForPeriod } from "@/lib/billing";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { recordAdminAction } from "@/lib/admin-audit";
import { attempt } from "@/lib/action-result";
import { UserError } from "@/lib/user-error";

export async function listOrganizations() {
  await requirePlatformAdmin();

  const [orgs, allPlans, allMemberships] = await Promise.all([
    db.select().from(organizations).orderBy(organizations.createdAt),
    db.select().from(plans),
    db.select({ organizationId: memberships.organizationId, email: users.email }).from(memberships).innerJoin(users, eq(memberships.userId, users.id)),
  ]);

  const planById = new Map(allPlans.map((p) => [p.id, p]));
  const memberCounts = new Map<string, number>();
  const memberEmailsByOrg = new Map<string, string[]>();
  for (const m of allMemberships) {
    memberCounts.set(m.organizationId, (memberCounts.get(m.organizationId) ?? 0) + 1);
    const emails = memberEmailsByOrg.get(m.organizationId) ?? [];
    emails.push(m.email);
    memberEmailsByOrg.set(m.organizationId, emails);
  }

  return {
    organizations: orgs.map((o) => ({
      ...o,
      planKey: planById.get(o.planId)?.key ?? null,
      memberCount: memberCounts.get(o.id) ?? 0,
      memberEmails: memberEmailsByOrg.get(o.id) ?? [],
    })),
    plans: allPlans,
  };
}

async function getOrgDetailImpl(orgId: string) {
  await requirePlatformAdmin();

  const [members, facilityRows, [itemCountRow], [lastMovement]] = await Promise.all([
    db
      .select({ userId: users.id, email: users.email, name: users.name, role: memberships.role, joinedAt: memberships.createdAt })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .where(eq(memberships.organizationId, orgId))
      .orderBy(memberships.createdAt),
    db.select({ id: facilities.id, name: facilities.name }).from(facilities).where(eq(facilities.organizationId, orgId)),
    db.select({ n: count() }).from(items).where(eq(items.organizationId, orgId)),
    db.select({ at: movements.createdAt }).from(movements).where(eq(movements.organizationId, orgId)).orderBy(desc(movements.createdAt)).limit(1),
  ]);

  return {
    members,
    facilities: facilityRows,
    itemCount: itemCountRow?.n ?? 0,
    lastActivityAt: lastMovement?.at ?? null,
  };
}

export async function getOrgDetail(orgId: string) {
  return attempt(() => getOrgDetailImpl(orgId), "getOrgDetail");
}

async function suspendOrganizationImpl(orgId: string, reason: string) {
  await requirePlatformAdmin();
  const trimmed = reason.trim();
  if (!trimmed) throw new UserError("A reason is required to suspend an organization");

  await db.update(organizations).set({ suspendedAt: new Date(), suspendedReason: trimmed }).where(eq(organizations.id, orgId));
  await recordAdminAction({ action: "org.suspend", targetType: "organization", targetId: orgId, metadata: { reason: trimmed } });
  revalidatePath("/internal");
}

export async function suspendOrganization(orgId: string, reason: string) {
  return attempt(() => suspendOrganizationImpl(orgId, reason), "suspendOrganization");
}

async function reactivateOrganizationImpl(orgId: string) {
  await requirePlatformAdmin();
  await db.update(organizations).set({ suspendedAt: null, suspendedReason: null }).where(eq(organizations.id, orgId));
  await recordAdminAction({ action: "org.reactivate", targetType: "organization", targetId: orgId });
  revalidatePath("/internal");
}

export async function reactivateOrganization(orgId: string) {
  return attempt(() => reactivateOrganizationImpl(orgId), "reactivateOrganization");
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
    const [before] = await db.select().from(organizations).where(eq(organizations.id, orgId));
    await db.update(organizations).set(values).where(eq(organizations.id, orgId));
    await recordAdminAction({
      action: "org.billing.update",
      targetType: "organization",
      targetId: orgId,
      metadata: {
        before: before ? { planId: before.planId, subscriptionStatus: before.subscriptionStatus, trialEndsAt: before.trialEndsAt, paidUntil: before.paidUntil } : null,
        after: values,
      },
    });
  }
  revalidatePath("/internal");
}

// The bank-transfer path: the founder saw the money land and records it
// here. Goes through the same applyPaidPayment() as a Paysera callback,
// so the period maths and the audit row are identical either way.
async function recordManualPaymentImpl(orgId: string, input: { planId: string; months: number; amountCents?: number; note?: string }) {
  await requirePlatformAdmin();
  if (!Number.isInteger(input.months) || input.months <= 0) throw new UserError("months must be a positive integer");

  const [plan] = await db.select().from(plans).where(eq(plans.id, input.planId));
  if (!plan) throw new UserError("Unknown plan");

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
  await recordAdminAction({
    action: "org.payment.manual",
    targetType: "organization",
    targetId: orgId,
    metadata: { planKey: plan.key, months: input.months, amountCents: payment.amountCents, note: input.note },
  });
  revalidatePath("/internal");
}

export async function listRecentPayments() {
  await requirePlatformAdmin();
  return db.select().from(payments).orderBy(desc(payments.createdAt)).limit(50);
}

export async function listAuditLog() {
  await requirePlatformAdmin();
  return db.select().from(adminAuditLog).orderBy(desc(adminAuditLog.createdAt)).limit(100);
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
  return attempt(() => updateOrgBillingImpl(orgId, patch), "updateOrgBilling");
}

export async function recordManualPayment(orgId: string, input: { planId: string; months: number; amountCents?: number; note?: string }) {
  return attempt(() => recordManualPaymentImpl(orgId, input), "recordManualPayment");
}

// Founder-only smoke test for error monitoring: throws a plain Error (not
// a UserError) so attempt() treats it as a bug and reports it to Sentry.
// The client sees the generic message — which is itself the check that
// raw failures don't leak to users.
async function throwTestErrorImpl() {
  await requirePlatformAdmin();
  throw new Error(`Sentry server-side test error ${new Date().toISOString()}`);
}

export async function throwTestError() {
  return attempt(() => throwTestErrorImpl(), "throwTestError");
}
