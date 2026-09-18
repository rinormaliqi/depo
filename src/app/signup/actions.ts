"use server";

import { hash } from "bcryptjs";
import { eq } from "drizzle-orm";
import { AuthError } from "next-auth";
import { getTranslations } from "next-intl/server";
import { signIn } from "@/auth";
import { db } from "@/db";
import { plans, users } from "@/db/schema";
import { isDisposableEmail, normalizeEmail } from "@/lib/email-normalize";
import { sendVerificationEmail } from "@/lib/email-verification";
import { createOrganizationForFounder } from "@/lib/onboarding";

type FormState = { error?: string } | undefined;

export async function signUp(_prevState: FormState, formData: FormData): Promise<FormState> {
  const t = await getTranslations("auth.signup");
  const name = formData.get("name")?.toString().trim();
  const companyName = formData.get("companyName")?.toString().trim();
  const email = formData.get("email")?.toString().trim().toLowerCase();
  const password = formData.get("password")?.toString();

  if (!name || !companyName || !email || !password) {
    return { error: t("errorRequired") };
  }
  if (password.length < 8) {
    return { error: t("errorPasswordLength") };
  }

  if (isDisposableEmail(email)) {
    return { error: t("errorDisposableEmail") };
  }

  // Compared on the alias-collapsed form, so `me+2@gmail.com` can't sign up
  // for a second trial next to `me@gmail.com` (see src/lib/email-normalize.ts).
  const normalizedEmail = normalizeEmail(email);
  const [existing] = await db.select().from(users).where(eq(users.normalizedEmail, normalizedEmail));
  if (existing) {
    return { error: t("errorEmailExists") };
  }

  // Checked before the user row exists, so a missing seed can't leave an
  // orphaned user behind.
  const [businessPlan] = await db.select({ id: plans.id }).from(plans).where(eq(plans.key, "business"));
  if (!businessPlan) {
    return { error: t("errorPlansNotSeeded") };
  }

  const passwordHash = await hash(password, 12);
  const [user] = await db.insert(users).values({ email, normalizedEmail, passwordHash, name }).returning();

  // trialEndsAt stays null until the email is verified — markEmailVerified()
  // starts the 30-day clock then. Until that point getOrgLockReason() treats
  // the org as "unverified": viewable, nothing writable.
  await createOrganizationForFounder({ userId: user.id, companyName, emailVerified: false });

  await sendVerificationEmail(user);

  try {
    await signIn("credentials", { email, password, redirectTo: "/verify-email" });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: t("errorSignInFailed") };
    }
    throw error;
  }
}
