"use server";

import { compare, hash } from "bcryptjs";
import { eq, gt, isNull, and } from "drizzle-orm";
import { AuthError } from "next-auth";
import { getTranslations } from "next-intl/server";
import { signIn } from "@/auth";
import { db } from "@/db";
import { invites, memberships, organizations, users } from "@/db/schema";
import { appBaseUrl } from "@/lib/app-url";
import { sendEmail } from "@/lib/email";
import { LIMITS, isLimited, record } from "@/lib/rate-limit";
import { normalizeEmail } from "@/lib/email-normalize";
import { markEmailVerified } from "@/lib/email-verification";
import { getOrgLockReason } from "@/lib/session";
import { rememberOrganization } from "@/lib/organizations";

// `values` carries the typed name back to the form: React resets an
// uncontrolled form to its defaultValue once the action resolves, errors
// included, so without this someone accepting an invite retypes their name
// every time the password is rejected.
type FormState = { error?: string; values?: { name?: string } } | undefined;

async function loadValidInvite(token: string) {
  const [invite] = await db
    .select()
    .from(invites)
    .where(and(eq(invites.token, token), isNull(invites.acceptedAt), gt(invites.expiresAt, new Date())));
  return invite ?? null;
}

// No signed-in session exists yet on this page (that's the whole point of
// an invite link) — check the *invited org's* lock status directly rather
// than through requireActiveOrg(), which needs a session.
async function orgLockError(organizationId: string) {
  const reason = await getOrgLockReason(organizationId);
  if (!reason) return null;
  const t = await getTranslations("orgLocked");
  return t(reason);
}

export async function acceptInviteAsExistingUser(_prevState: FormState, formData: FormData): Promise<FormState> {
  const t = await getTranslations("invite.error");
  const token = formData.get("token")?.toString();
  const password = formData.get("password")?.toString();
  if (!token || !password) return { error: t("required") };

  const invite = await loadValidInvite(token);
  if (!invite) return { error: t("invalid") };
  const lockError = await orgLockError(invite.organizationId);
  if (lockError) return { error: lockError };

  const [user] = await db.select().from(users).where(eq(users.normalizedEmail, normalizeEmail(invite.email)));
  if (!user || !user.passwordHash || !(await compare(password, user.passwordHash))) {
    return { error: t("wrongPassword") };
  }

  // Verify the password ourselves before writing anything, then use
  // signIn() purely to establish the session — its own redirect-on-success
  // means no code after a successful signIn() call would ever run, so the
  // membership/invite writes have to happen first, not after.
  await db.insert(memberships).values({ userId: user.id, organizationId: invite.organizationId, role: invite.role });
  await db.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, invite.id));
  // Reaching this page means the invite link landed in that inbox — as
  // good a proof as a verification link, so don't make them do both.
  await markEmailVerified(user.id);
  // Land in the company just joined, not whichever one came first.
  await rememberOrganization(invite.organizationId);

  try {
    await signIn("credentials", { email: user.email, password, redirectTo: "/start" });
  } catch (error) {
    if (error instanceof AuthError) return { error: t("signInFailed") };
    throw error;
  }
}

export async function acceptInviteAsNewUser(_prevState: FormState, formData: FormData): Promise<FormState> {
  const t = await getTranslations("invite.error");
  const token = formData.get("token")?.toString();
  const name = formData.get("name")?.toString().trim();
  const password = formData.get("password")?.toString();
  const values = { name };
  if (!token || !name || !password) return { error: t("required"), values };
  if (password.length < 8) return { error: t("passwordLength"), values };

  const invite = await loadValidInvite(token);
  if (!invite) return { error: t("invalid"), values };
  const lockError = await orgLockError(invite.organizationId);
  if (lockError) return { error: lockError, values };

  const normalizedEmail = normalizeEmail(invite.email);
  const [existing] = await db.select().from(users).where(eq(users.normalizedEmail, normalizedEmail));
  if (existing) return { error: t("accountExists"), values };

  const passwordHash = await hash(password, 12);
  const [user] = await db
    .insert(users)
    .values({ email: invite.email, normalizedEmail, passwordHash, name, emailVerifiedAt: new Date() })
    .returning();
  await db.insert(memberships).values({ userId: user.id, organizationId: invite.organizationId, role: invite.role });
  await db.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, invite.id));
  await rememberOrganization(invite.organizationId);

  try {
    await signIn("credentials", { email: invite.email, password, redirectTo: "/start" });
  } catch (error) {
    if (error instanceof AuthError) return { error: t("signInFailed") };
    throw error;
  }
}

// A dead link (expired or already used) can ask the inviter for a fresh
// one with a click — public, so it works for someone who never got an
// account; rate-limited per token so a link in a spam folder can't be
// used to nag the inviter.
export async function requestNewInvite(token: string): Promise<{ ok: true } | { error: string }> {
  const t = await getTranslations("invite");
  const [invite] = await db.select().from(invites).where(eq(invites.token, token));
  if (!invite) return { error: t("error.invalid") };
  const key = `invite-renew:${invite.id}`;
  if (await isLimited(key, LIMITS.inviteRenew)) return { ok: true }; // already asked; don't nag twice
  await record(key);

  const [inviter] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, invite.invitedBy));
  const [org] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, invite.organizationId));
  if (!inviter) return { ok: true };
  const te = await getTranslations("invite.renewEmail");
  await sendEmail({
    to: inviter.email,
    subject: te("subject", { email: invite.email }),
    text: te("body", { inviter: inviter.name, email: invite.email, org: org?.name ?? "", url: `${await appBaseUrl()}/team` }),
  });
  return { ok: true };
}
