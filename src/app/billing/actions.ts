"use server";

import { and, desc, eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/db";
import { organizations, payments, plans, users } from "@/db/schema";
import { appBaseUrl } from "@/lib/app-url";
import { BILLING_CURRENCY, SELF_SERVE_PLAN_KEYS, getOrgUsage, isBillingMonths, limitsExceeded, priceForPeriod } from "@/lib/billing";
import { maybeSendExpiryReminder } from "@/lib/billing-reminders";
import { buildPayseraPaymentUrl, getPayseraConfig } from "@/lib/paysera";
import { requirePermission } from "@/lib/permissions";
import { getOrgLockReason, requireSession } from "@/lib/session";

export async function getMyBilling() {
  const session = await requireSession();

  const [org] = await db.select().from(organizations).where(eq(organizations.id, session.organizationId));
  const [plan] = await db.select().from(plans).where(eq(plans.id, org.planId));
  const usage = await getOrgUsage(session.organizationId);

  const selfServePlans = await db
    .select()
    .from(plans)
    .where(and(inArray(plans.key, [...SELF_SERVE_PLAN_KEYS]), eq(plans.isActive, true)))
    .orderBy(plans.priceCents);

  const history = await db
    .select()
    .from(payments)
    .where(and(eq(payments.organizationId, session.organizationId), eq(payments.status, "paid")))
    .orderBy(desc(payments.paidAt))
    .limit(12);

  return {
    org,
    plan,
    usage,
    lockReason: await getOrgLockReason(session.organizationId),
    role: session.role,
    onlinePaymentsEnabled: getPayseraConfig() !== null,
    // Each purchasable plan with why (if at all) the org can't move to it.
    options: selfServePlans.map((p) => ({ plan: p, blockedBy: limitsExceeded(p, usage) })),
    history,
  };
}

// A lighter query for the header's plan pill — avoid the usage-count joins
// above on every single page load just to show a badge. Doubles as the
// hook for the lazy expiry reminder, since it runs on every page view.
export async function getBillingSummary() {
  const session = await requireSession();
  const [org] = await db.select().from(organizations).where(eq(organizations.id, session.organizationId));
  const [plan] = await db.select().from(plans).where(eq(plans.id, org.planId));
  maybeSendExpiryReminder(session.organizationId).catch((e) => console.error("[billing] reminder check failed", e));
  return {
    subscriptionStatus: org.subscriptionStatus,
    trialEndsAt: org.trialEndsAt,
    paidUntil: org.paidUntil,
    planName: plan?.name ?? null,
  };
}

type CheckoutState = { error?: string } | undefined;

// Creates a pending payment row and sends the admin to Paysera's hosted
// page. Access is only granted by the signed callback (see
// src/app/api/billing/paysera/callback/route.ts) — never by the return
// redirect, which anyone could type into a browser.
export async function startCheckout(_prevState: CheckoutState, formData: FormData): Promise<CheckoutState> {
  const t = await getTranslations("billing.error");
  let session: Awaited<ReturnType<typeof requireSession>>;
  try {
    session = await requirePermission("manageBilling");
  } catch {
    // A locked org must still be able to pay its way out — that's the
    // whole point — so only the role matters here, not the lock.
    const s = await requireSession();
    if (s.role !== "admin") return { error: t("adminOnly") };
    session = s;
  }

  const config = getPayseraConfig();
  if (!config) return { error: t("notConfigured") };

  const planKey = formData.get("plan")?.toString();
  const months = Number(formData.get("months"));
  if (!planKey || !(SELF_SERVE_PLAN_KEYS as readonly string[]).includes(planKey) || !isBillingMonths(months)) {
    return { error: t("invalidChoice") };
  }

  const [plan] = await db.select().from(plans).where(and(eq(plans.key, planKey), eq(plans.isActive, true)));
  if (!plan) return { error: t("invalidChoice") };

  const usage = await getOrgUsage(session.organizationId);
  if (limitsExceeded(plan, usage).length > 0) return { error: t("overLimits", { plan: plan.name }) };

  const [payer] = await db.select({ email: users.email }).from(users).where(eq(users.id, session.userId));
  const [org] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, session.organizationId));

  const [payment] = await db
    .insert(payments)
    .values({
      organizationId: session.organizationId,
      planId: plan.id,
      months,
      amountCents: priceForPeriod(plan, months),
      currency: BILLING_CURRENCY,
      status: "pending",
      provider: "paysera",
      payerEmail: payer?.email,
    })
    .returning();

  const base = await appBaseUrl();
  const locale = await getLocale();
  const url = buildPayseraPaymentUrl(config, {
    orderId: payment.id,
    amountCents: payment.amountCents,
    currency: payment.currency,
    acceptUrl: `${base}/billing/return?payment=${payment.id}`,
    cancelUrl: `${base}/billing?canceled=${payment.id}`,
    callbackUrl: `${base}/api/billing/paysera/callback`,
    payText: `SmartDepo ${plan.name} × ${months} — ${org?.name ?? ""}`.slice(0, 255),
    payerEmail: payer?.email,
    lang: locale === "sq" ? "SQI" : "ENG",
  });

  redirect(url);
}

export async function getPaymentStatus(paymentId: string) {
  const session = await requireSession();
  const [payment] = await db.select().from(payments).where(and(eq(payments.id, paymentId), eq(payments.organizationId, session.organizationId)));
  return payment ?? null;
}
