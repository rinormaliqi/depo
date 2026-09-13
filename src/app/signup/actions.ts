"use server";

import { hash } from "bcryptjs";
import { eq } from "drizzle-orm";
import { AuthError } from "next-auth";
import { getTranslations } from "next-intl/server";
import { signIn } from "@/auth";
import { db } from "@/db";
import { facilities, memberships, organizations, plans, users } from "@/db/schema";

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

  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) {
    return { error: t("errorEmailExists") };
  }

  const [businessPlan] = await db.select().from(plans).where(eq(plans.key, "business"));
  if (!businessPlan) {
    return { error: t("errorPlansNotSeeded") };
  }

  const passwordHash = await hash(password, 12);
  const [user] = await db.insert(users).values({ email, passwordHash, name }).returning();

  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + 30);

  const [org] = await db
    .insert(organizations)
    .values({
      name: companyName,
      planId: businessPlan.id,
      subscriptionStatus: "trialing",
      trialEndsAt,
    })
    .returning();

  await db.insert(memberships).values({ userId: user.id, organizationId: org.id, role: "admin" });
  await db.insert(facilities).values({ organizationId: org.id, name: "Main Facility" });

  try {
    await signIn("credentials", { email, password, redirectTo: "/builder" });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: t("errorSignInFailed") };
    }
    throw error;
  }
}
