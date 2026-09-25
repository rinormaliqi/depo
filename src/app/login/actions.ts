"use server";

import { AuthError } from "next-auth";
import { getTranslations } from "next-intl/server";
import { signIn } from "@/auth";
import { LIMITS, assertNotLimited, clientIp, record } from "@/lib/rate-limit";
import { UserError } from "@/lib/user-error";

// `values` carries what was submitted back to the form. React resets an
// uncontrolled form to its defaultValue once the action resolves — errors
// included — so handing the values back as defaults is what makes a
// rejected submit leave the page as the person typed it.
type FormState = { error?: string; googleOnly?: boolean; values?: { email?: string } } | undefined;

export async function login(_prevState: FormState, formData: FormData): Promise<FormState> {
  const t = await getTranslations("auth.login");
  const email = formData.get("email")?.toString().trim().toLowerCase();
  const password = formData.get("password")?.toString();

  if (!email || !password) {
    return { error: t("errorRequired"), values: { email } };
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
    if (e instanceof UserError) return { error: e.message, values: { email } };
    throw e;
  }

  try {
    await signIn("credentials", { email, password, redirectTo: "/start" });
  } catch (error) {
    if (error instanceof AuthError) {
      await Promise.all([record(emailKey), record(ipKey)]);
      // authorize() flags an account that has no password (Google only) —
      // "wrong password" would be true but useless there.
      if ((error as { code?: string }).code === "google_only") return { error: t("errorGoogleOnly"), googleOnly: true, values: { email } };
      return { error: t("errorInvalid"), values: { email } };
    }
    throw error;
  }
}
