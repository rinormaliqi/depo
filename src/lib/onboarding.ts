import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { facilities, invites, memberships, organizations, plans, users } from "@/db/schema";
import { normalizeEmail } from "@/lib/email-normalize";
import { markEmailVerified, TRIAL_DAYS } from "@/lib/email-verification";

// What a new company gets on day one, whichever door it came in through:
// the password signup form (src/app/signup/actions.ts) and the Google
// "what's your company called?" step (src/app/welcome) both end here. A
// founder whose inbox is already proven (Google vouches for the address)
// starts the 30-day trial right away; a password signup leaves
// trialEndsAt null until the verification link is clicked, exactly as
// before — markEmailVerified() starts the clock then.
export async function createOrganizationForFounder(opts: { userId: string; companyName: string; emailVerified: boolean }) {
  const [businessPlan] = await db.select().from(plans).where(eq(plans.key, "business"));
  if (!businessPlan) throw new Error("plans not seeded");

  const trialEndsAt = opts.emailVerified ? new Date(Date.now() + TRIAL_DAYS * 86400_000) : null;
  const [org] = await db
    .insert(organizations)
    .values({ name: opts.companyName, planId: businessPlan.id, subscriptionStatus: "trialing", trialEndsAt })
    .returning();
  await db.insert(memberships).values({ userId: opts.userId, organizationId: org.id, role: "admin" });
  await db.insert(facilities).values({ organizationId: org.id, name: "Main Facility" });
  return org;
}

export async function hasMembership(userId: string) {
  const [m] = await db.select({ id: memberships.id }).from(memberships).where(eq(memberships.userId, userId)).limit(1);
  return !!m;
}

// Google sign-in lands here from the Auth.js signIn callback. One inbox
// is one user, on the same alias-collapsed key the password signup uses
// — so someone who signed up with a password and later taps "Continue
// with Google" with the same address gets *their* account, not a second
// one. A new address gets a user row with no password and, since Google
// vouched for the inbox, no verification round-trip; they still have no
// organization until /welcome asks for the company name.
export async function ensureUserFromGoogle(profile: { email: string; name?: string | null; emailVerified: boolean }) {
  if (!profile.emailVerified) return null;
  const email = profile.email.trim().toLowerCase();
  const normalizedEmail = normalizeEmail(email);

  const [existing] = await db.select().from(users).where(eq(users.normalizedEmail, normalizedEmail));
  if (existing) {
    if (!existing.emailVerifiedAt) await markEmailVerified(existing.id);
    return existing;
  }

  const [user] = await db
    .insert(users)
    .values({ email, normalizedEmail, passwordHash: null, name: profile.name?.trim() || email.split("@")[0], emailVerifiedAt: new Date() })
    .returning();
  return user;
}

export type InviteViaSessionResult = "joined" | "invalid" | "mismatch" | "already-member";

// An invite opened while signed in (typically straight after "Continue
// with Google" from the invite page): the session's address has to be
// the invited one — collapsed the same way — or nothing happens; the page
// then says who's signed in and who was invited.
export async function acceptInviteViaSession(token: string, userId: string): Promise<InviteViaSessionResult> {
  const [invite] = await db
    .select()
    .from(invites)
    .where(and(eq(invites.token, token), isNull(invites.acceptedAt), gt(invites.expiresAt, new Date())));
  if (!invite) return "invalid";

  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user || user.normalizedEmail !== normalizeEmail(invite.email)) return "mismatch";

  const [existing] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.organizationId, invite.organizationId)));
  if (existing) {
    await db.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, invite.id));
    return "already-member";
  }

  await db.insert(memberships).values({ userId, organizationId: invite.organizationId, role: invite.role });
  await db.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, invite.id));
  await markEmailVerified(userId);
  return "joined";
}
