import { randomBytes } from "crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import { emailVerifications, memberships, organizations, users } from "@/db/schema";
import { appBaseUrl } from "@/lib/app-url";
import { sendEmail } from "@/lib/email";
import { isDisposableEmail, normalizeEmail } from "@/lib/email-normalize";
import { UserError } from "@/lib/user-error";

const VERIFY_VALID_HOURS = 24;
// Minimum gap between two verification mails to the same user — the
// "resend" button is the only thing that hits this, and without a floor
// it's a free way to make us spam an inbox (and burn Resend quota).
const RESEND_COOLDOWN_SECONDS = 60;
export const TRIAL_DAYS = 30;

export async function sendVerificationEmail(user: { id: string; email: string }) {
  const t = await getTranslations("verifyEmail.email");
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + VERIFY_VALID_HOURS * 60 * 60 * 1000);
  await db.insert(emailVerifications).values({ userId: user.id, token, expiresAt });

  const url = `${await appBaseUrl()}/verify-email/${token}`;
  await sendEmail({ to: user.email, subject: t("subject"), text: t("body", { url }) });
}

// Returns false (without sending) when the last mail went out too recently.
export async function resendVerificationEmail(user: { id: string; email: string }): Promise<boolean> {
  const [latest] = await db
    .select({ createdAt: emailVerifications.createdAt })
    .from(emailVerifications)
    .where(eq(emailVerifications.userId, user.id))
    .orderBy(desc(emailVerifications.createdAt))
    .limit(1);
  if (latest && Date.now() - latest.createdAt.getTime() < RESEND_COOLDOWN_SECONDS * 1000) return false;

  await sendVerificationEmail(user);
  return true;
}

// The one place a user flips to verified, whichever link proved the inbox.
// Also starts the trial clock on any org this user founded that's still
// waiting on verification (trialing with no trial_ends_at) — the 30 days
// count from here, not from the signup form, so an unverified signup can't
// quietly burn its own trial before ever getting in.
export async function markEmailVerified(userId: string) {
  const now = new Date();
  await db.update(users).set({ emailVerifiedAt: now }).where(and(eq(users.id, userId), isNull(users.emailVerifiedAt)));

  const trialEndsAt = new Date(now);
  trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DAYS);

  const founded = await db
    .select({ organizationId: memberships.organizationId })
    .from(memberships)
    .innerJoin(organizations, eq(memberships.organizationId, organizations.id))
    .where(
      and(
        eq(memberships.userId, userId),
        eq(memberships.role, "admin"),
        eq(organizations.subscriptionStatus, "trialing"),
        isNull(organizations.trialEndsAt),
      ),
    );
  for (const { organizationId } of founded) {
    await db.update(organizations).set({ trialEndsAt }).where(eq(organizations.id, organizationId));
  }
}

// Redeems a token: null if it's unknown, expired, or already used.
// Redeems a token. The failure says *why*, so the page can offer the right
// next step: an expired link gets "send a new one", a used one "you're
// already verified, log in", an unknown one nothing but the login.
export type VerificationOutcome =
  | { ok: true; userId: string }
  | { ok: false; reason: "expired" | "used" | "unknown"; userId?: string };

export async function consumeVerificationToken(token: string): Promise<VerificationOutcome> {
  const [row] = await db.select().from(emailVerifications).where(eq(emailVerifications.token, token));
  if (!row) return { ok: false, reason: "unknown" };
  if (row.usedAt) return { ok: false, reason: "used", userId: row.userId };
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired", userId: row.userId };

  await db.update(emailVerifications).set({ usedAt: new Date() }).where(eq(emailVerifications.id, row.id));
  await markEmailVerified(row.userId);
  return { ok: true, userId: row.userId };
}

// A signup that typed the wrong address can fix it before verifying: the
// old tokens die (a link to the wrong inbox must never verify the new
// address), the row moves to the new address under the same uniqueness
// and disposable-domain rules as signup, and a fresh link goes out.
export async function changeUnverifiedEmail(userId: string, rawEmail: string): Promise<{ email: string }> {
  const t = await getTranslations("verifyEmail.change");
  const email = rawEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new UserError(t("errorEmail"));
  if (isDisposableEmail(email)) throw new UserError(t("errorDisposable"));

  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) throw new UserError(t("errorNotSignedIn"));
  if (user.emailVerifiedAt) throw new UserError(t("errorAlreadyVerified"));

  const normalizedEmail = normalizeEmail(email);
  if (normalizedEmail !== user.normalizedEmail) {
    const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.normalizedEmail, normalizedEmail));
    if (taken) throw new UserError(t("errorTaken"));
  }

  await db.update(users).set({ email, normalizedEmail }).where(eq(users.id, userId));
  await db
    .update(emailVerifications)
    .set({ usedAt: new Date() })
    .where(and(eq(emailVerifications.userId, userId), isNull(emailVerifications.usedAt)));
  await sendVerificationEmail({ id: userId, email });
  return { email };
}
