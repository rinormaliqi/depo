import { eq } from "drizzle-orm";
import { db } from "@/db";
import { loadUsage } from "@/lib/capabilities";
import { organizations, payments } from "@/db/schema";
import { addMonths } from "@/lib/billing-plans";

export * from "@/lib/billing-plans";

// One counter for the whole app (src/lib/capabilities.ts): what the
// plan-limit checks compare against is what /billing shows.
export const getOrgUsage = loadUsage;

// Turns a paid payment into access. Idempotent on the payment row (a
// Paysera callback can be delivered more than once) and the single place
// paid_until moves forward, whether the money came through Paysera or a
// bank transfer recorded on /internal.
//
// The period starts from the later of "now" and the current paid_until
// when the org is already active on the same plan — paying early extends,
// it doesn't overwrite. A plan change (up or down) starts a fresh period
// from now: no proration, the previous period is simply superseded.
export async function applyPaidPayment(paymentId: string, extra: { providerReference?: string; payerEmail?: string } = {}) {
  const [payment] = await db.select().from(payments).where(eq(payments.id, paymentId));
  if (!payment) throw new Error(`Payment ${paymentId} not found`);
  if (payment.status === "paid") return payment; // already applied

  const [org] = await db.select().from(organizations).where(eq(organizations.id, payment.organizationId));
  if (!org) throw new Error(`Organization ${payment.organizationId} not found`);

  const now = new Date();
  const samePlanStillPaid =
    org.subscriptionStatus === "active" && org.planId === payment.planId && org.paidUntil && org.paidUntil.getTime() > now.getTime();
  const periodStart = samePlanStillPaid ? org.paidUntil! : now;
  const periodEnd = addMonths(periodStart, payment.months);

  await db.transaction(async (tx) => {
    await tx
      .update(payments)
      .set({ status: "paid", paidAt: now, periodStart, periodEnd, ...extra })
      .where(eq(payments.id, payment.id));
    await tx
      .update(organizations)
      .set({ planId: payment.planId, subscriptionStatus: "active", paidUntil: periodEnd, trialEndsAt: null })
      .where(eq(organizations.id, org.id));
  });

  return { ...payment, status: "paid" as const, paidAt: now, periodStart, periodEnd };
}
