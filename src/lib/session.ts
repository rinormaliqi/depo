import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { memberships, organizations } from "@/db/schema";

// Assumes one org per user for now — no multi-org switching UI yet.
export async function getMySession() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const [membership] = await db
    .select()
    .from(memberships)
    .where(eq(memberships.userId, session.user.id))
    .limit(1);
  if (!membership) return null;

  return { userId: session.user.id, organizationId: membership.organizationId, role: membership.role };
}

export async function requireSession() {
  const result = await getMySession();
  if (!result) {
    throw new Error("Not authenticated or no organization membership");
  }
  return result;
}

export async function getMyOrgId() {
  const result = await getMySession();
  return result?.organizationId ?? null;
}

export async function requireOrgId() {
  return (await requireSession()).organizationId;
}

// docs/pricing.md: a trial that ends without a payment method moves the
// org to a locked/read-only state — data preserved, nothing new writable.
// Reused for "active" (never locked), "past_due" and "canceled" too, not
// only trial expiry: none of those represent an active paid plan either,
// so the same read-only rule applies to all of them (see the "Trial-expiry
// lockout" section in docs/architecture.md).
export type OrgLockReason = "trialEnded" | "pastDue" | "canceled" | null;

export async function getOrgLockReason(organizationId: string): Promise<OrgLockReason> {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId));
  if (!org) return "canceled"; // shouldn't happen — fail locked, not open
  if (org.subscriptionStatus === "active") return null;
  if (org.subscriptionStatus === "trialing") {
    return org.trialEndsAt && org.trialEndsAt.getTime() < Date.now() ? "trialEnded" : null;
  }
  if (org.subscriptionStatus === "past_due") return "pastDue";
  return "canceled";
}

// The write-path counterpart to requireSession() — call this instead at
// the top of any action that mutates org-scoped data (not read actions,
// which stay on requireSession()/requireOrgId() so a locked org can still
// view what it already built).
export async function requireActiveOrg() {
  const session = await requireSession();
  const reason = await getOrgLockReason(session.organizationId);
  if (reason) {
    const t = await getTranslations("orgLocked");
    throw new Error(t(reason));
  }
  return session;
}
