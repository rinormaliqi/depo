"use server";

import { AuthError } from "next-auth";
import { getTranslations } from "next-intl/server";
import { signIn } from "@/auth";
import { LIMITS, assertNotLimited, clientIp, record } from "@/lib/rate-limit";
import { UserError } from "@/lib/user-error";

type FormState = { error?: string; googleOnly?: boolean } | undefined;

export async function login(_prevState: FormState, formData: FormData): Promise<FormState> {
  const t = await getTranslations("auth.login");
  const email = formData.get("email")?.toString().trim().toLowerCase();
  const password = formData.get("password")?.toString();

  if (!email || !password) {
    return { error: t("errorRequired") };
  }

  // Failed attempts are counted per address and per IP; a correct
  // password is never counted, so nobody locks themselves out by logging
  // in a lot. Checked before signIn so a blocked address isn't even tried.
  const ip = await clientIp();
  const emailKey = `login:email:${email}`;
  const ipKey = `login:ip:${ip}`;
  try {
    await assertNotLimited(emailKey, LIMITS.loginEmail);
    await assertNotLimited(ipKey, LIMITS.loginIp);
  } catch (e) {
    if (e instanceof UserError) return { error: e.message };
    throw e;
  }

  try {
    await signIn("credentials", { email, password, redirectTo: "/start" });
  } catch (error) {
    if (error instanceof AuthError) {
      await Promise.all([record(emailKey), record(ipKey)]);
      // authorize() flags an account that has no password (Google only) —
      // "wrong password" would be true but useless there.
      if ((error as { code?: string }).code === "google_only") return { error: t("errorGoogleOnly"), googleOnly: true };
      return { error: t("errorInvalid") };
    }
    throw error;
  }
}
