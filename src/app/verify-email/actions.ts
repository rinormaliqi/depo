"use server";

import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { resendVerificationEmail } from "@/lib/email-verification";

type FormState = { error?: string; sent?: boolean } | undefined;

export async function resendVerification(): Promise<FormState> {
  const t = await getTranslations("verifyEmail");
  const session = await auth();
  if (!session?.user?.id) return { error: t("error.notSignedIn") };

  const [user] = await db.select().from(users).where(eq(users.id, session.user.id));
  if (!user) return { error: t("error.notSignedIn") };
  if (user.emailVerifiedAt) return { sent: true };

  const sent = await resendVerificationEmail(user);
  return sent ? { sent: true } : { error: t("error.tooSoon") };
}
