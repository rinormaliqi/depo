"use server";

import { compare, hash } from "bcryptjs";
import { eq, gt, isNull, and } from "drizzle-orm";
import { AuthError } from "next-auth";
import { getTranslations } from "next-intl/server";
import { signIn } from "@/auth";
import { db } from "@/db";
import { invites, memberships, users } from "@/db/schema";
import { normalizeEmail } from "@/lib/email-normalize";
import { markEmailVerified } from "@/lib/email-verification";
import { getOrgLockReason } from "@/lib/session";

type FormState = { error?: string } | undefined;

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

  try {
    await signIn("credentials", { email: user.email, password, redirectTo: "/builder" });
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
  if (!token || !name || !password) return { error: t("required") };
  if (password.length < 8) return { error: t("passwordLength") };

  const invite = await loadValidInvite(token);
  if (!invite) return { error: t("invalid") };
  const lockError = await orgLockError(invite.organizationId);
  if (lockError) return { error: lockError };

  const normalizedEmail = normalizeEmail(invite.email);
  const [existing] = await db.select().from(users).where(eq(users.normalizedEmail, normalizedEmail));
  if (existing) return { error: t("accountExists") };

  const passwordHash = await hash(password, 12);
  const [user] = await db
    .insert(users)
    .values({ email: invite.email, normalizedEmail, passwordHash, name, emailVerifiedAt: new Date() })
    .returning();
  await db.insert(memberships).values({ userId: user.id, organizationId: invite.organizationId, role: invite.role });
  await db.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, invite.id));

  try {
    await signIn("credentials", { email: invite.email, password, redirectTo: "/builder" });
  } catch (error) {
    if (error instanceof AuthError) return { error: t("signInFailed") };
    throw error;
  }
}
