"use server";

import { AuthError } from "next-auth";
import { getTranslations } from "next-intl/server";
import { signIn } from "@/auth";

type FormState = { error?: string } | undefined;

export async function login(_prevState: FormState, formData: FormData): Promise<FormState> {
  const t = await getTranslations("auth.login");
  const email = formData.get("email")?.toString().trim().toLowerCase();
  const password = formData.get("password")?.toString();

  if (!email || !password) {
    return { error: t("errorRequired") };
  }

  try {
    await signIn("credentials", { email, password, redirectTo: "/start" });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: t("errorInvalid") };
    }
    throw error;
  }
}
