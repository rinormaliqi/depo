"use server";

import { count, desc, gte } from "drizzle-orm";
import { BILLING_CURRENCY } from "@/lib/billing";
import { db } from "@/db";
import { movements, organizations, plans } from "@/db/schema";
import { requirePlatformAdmin } from "@/lib/platform-admin";

const DAY_MS = 86_400_000;
const ACTIVITY_WINDOW_DAYS = 30;
const MOST_ACTIVE_LIMIT = 10;

export type SubscriptionStatusCounts = Record<"trialing" | "active" | "past_due" | "canceled", number>;

// The project's own page when the project is known. SENTRY_PROJECT is the
// slug (what the build's source-map upload needs), and the issues list's
// ?project= filter takes the numeric id instead — given a slug it showed
// every project's issues (#195).
function sentryUrl(org: string | undefined, project: string | undefined) {
  if (!org?.trim()) return null;
  const base = `https://${encodeURIComponent(org.trim())}.sentry.io`;
  return project?.trim() ? `${base}/projects/${encodeURIComponent(project.trim())}/` : `${base}/issues/`;
}

export async function getPlatformOverview() {
  await requirePlatformAdmin();

  const [orgRows, allPlans] = await Promise.all([
    db.select({
      id: organizations.id,
      name: organizations.name,
      planId: organizations.planId,
      subscriptionStatus: organizations.subscriptionStatus,
      paidUntil: organizations.paidUntil,
      suspendedAt: organizations.suspendedAt,
      createdAt: organizations.createdAt,
    }).from(organizations),
    db.select().from(plans),
  ]);
  const planById = new Map(allPlans.map((p) => [p.id, p]));

  const now = Date.now();
  const statusCounts: SubscriptionStatusCounts = { trialing: 0, active: 0, past_due: 0, canceled: 0 };
  let suspendedCount = 0;
  let newLast30Days = 0;
  let newLast90Days = 0;
  // Prepaid periods, not a running subscription (docs/pricing.md), so
  // there is no literal "monthly recurring charge" to sum — this adds up
  // the current plan's monthly price for every org that is `active` and
  // not past its paid-until, i.e. "revenue this org currently represents
  // per month if it renews on the same plan". An estimate, labeled as one
  // wherever it's shown, not an accounting figure.
  let mrrCents = 0;

  for (const org of orgRows) {
    statusCounts[org.subscriptionStatus] += 1;
    if (org.suspendedAt) suspendedCount += 1;

    const ageMs = now - org.createdAt.getTime();
    if (ageMs <= 30 * DAY_MS) newLast30Days += 1;
    if (ageMs <= 90 * DAY_MS) newLast90Days += 1;

    if (org.subscriptionStatus === "active") {
      const stillPaid = !org.paidUntil || org.paidUntil.getTime() >= now;
      if (stillPaid) mrrCents += planById.get(org.planId)?.priceCents ?? 0;
    }
  }

  const activitySince = new Date(now - ACTIVITY_WINDOW_DAYS * DAY_MS);
  const activityRows = await db
    .select({ organizationId: movements.organizationId, movementCount: count() })
    .from(movements)
    .where(gte(movements.createdAt, activitySince))
    .groupBy(movements.organizationId)
    .orderBy(desc(count()))
    .limit(MOST_ACTIVE_LIMIT);

  const orgNameById = new Map(orgRows.map((o) => [o.id, o.name]));
  const mostActive = activityRows.map((r) => ({
    organizationId: r.organizationId,
    name: orgNameById.get(r.organizationId) ?? "—",
    movementCount: r.movementCount,
  }));

  return {
    totalOrganizations: orgRows.length,
    statusCounts,
    suspendedCount,
    newLast30Days,
    newLast90Days,
    mrrCents,
    mrrCurrency: BILLING_CURRENCY,
    activityWindowDays: ACTIVITY_WINDOW_DAYS,
    mostActive,
    sentryUrl: sentryUrl(process.env.SENTRY_ORG, process.env.SENTRY_PROJECT),
  };
}
