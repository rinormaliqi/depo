"use server";

import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { changeUnverifiedEmail, resendVerificationEmail } from "@/lib/email-verification";
import { LIMITS, assertNotLimited, record } from "@/lib/rate-limit";
import { UserError } from "@/lib/user-error";

type FormState = { error?: string; sent?: boolean } | undefined;

export async function resendVerification(): Promise<FormState> {
  const t = await getTranslations("verifyEmail");
  const session = await auth();
  if (!session?.user?.id) return { error: t("error.notSignedIn") };

  const [user] = await db.select().from(users).where(eq(users.id, session.user.id));
  if (!user) return { error: t("error.notSignedIn") };
  if (user.emailVerifiedAt) return { sent: true };

  const key = `verify-resend:user:${user.id}`;
  try {
    await assertNotLimited(key, LIMITS.verificationResend);
  } catch (e) {
    if (e instanceof UserError) return { error: e.message };
    throw e;
  }
  const sent = await resendVerificationEmail(user);
  if (sent) await record(key);
  return sent ? { sent: true } : { error: t("error.tooSoon") };
}

type ChangeState = { error?: string; changedTo?: string; at?: number } | undefined;

// One change per 10 minutes per user: enough to fix a typo, not enough to
// turn the verification mailer into a relay.
export async function changeEmail(_prev: ChangeState, formData: FormData): Promise<ChangeState> {
  const t = await getTranslations("verifyEmail");
  const session = await auth();
  if (!session?.user?.id) return { error: t("error.notSignedIn") };
  const key = `verify-change:user:${session.user.id}`;
  try {
    await assertNotLimited(key, LIMITS.emailChange);
    const { email } = await changeUnverifiedEmail(session.user.id, formData.get("email")?.toString() ?? "");
    await record(key);
    return { changedTo: email, at: Date.now() };
  } catch (e) {
    if (e instanceof UserError) return { error: e.message };
    throw e;
  }
}
