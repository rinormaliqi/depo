"use server";

import { hash } from "bcryptjs";
import { and, eq, gt, isNull } from "drizzle-orm";
import { AuthError } from "next-auth";
import { getTranslations } from "next-intl/server";
import { signIn } from "@/auth";
import { db } from "@/db";
import { passwordResets, users } from "@/db/schema";

type FormState = { error?: string } | undefined;

export async function resetPassword(_prevState: FormState, formData: FormData): Promise<FormState> {
  const t = await getTranslations("resetPassword.error");
  const token = formData.get("token")?.toString();
  const password = formData.get("password")?.toString();
  if (!token || !password) return { error: t("required") };
  if (password.length < 8) return { error: t("passwordLength") };

  const [reset] = await db
    .select()
    .from(passwordResets)
    .where(and(eq(passwordResets.token, token), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, new Date())));
  if (!reset) return { error: t("invalid") };

  const [user] = await db.select().from(users).where(eq(users.id, reset.userId));
  if (!user) return { error: t("invalid") };

  const passwordHash = await hash(password, 12);
  await db.update(users).set({ passwordHash }).where(eq(users.id, user.id));
  await db.update(passwordResets).set({ usedAt: new Date() }).where(eq(passwordResets.id, reset.id));

  try {
    await signIn("credentials", { email: user.email, password, redirectTo: "/builder" });
  } catch (error) {
    if (error instanceof AuthError) return { error: t("signInFailed") };
    throw error;
  }
}
