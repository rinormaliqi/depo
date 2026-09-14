"use server";

import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import { passwordResets, users } from "@/db/schema";
import { sendEmail } from "@/lib/email";

const RESET_VALID_MINUTES = 60;

type FormState = { error?: string; sent?: boolean } | undefined;

export async function requestPasswordReset(_prevState: FormState, formData: FormData): Promise<FormState> {
  const t = await getTranslations("forgotPassword");
  const email = formData.get("email")?.toString().trim().toLowerCase();
  if (!email) return { error: t("error.required") };

  const [user] = await db.select().from(users).where(eq(users.email, email));

  // Always report success, whether or not that email has an account —
  // confirming/denying it here would let anyone enumerate real accounts by
  // email. The visible outcome is identical either way; only the send
  // (or not) differs.
  if (user) {
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + RESET_VALID_MINUTES * 60 * 1000);
    await db.insert(passwordResets).values({ userId: user.id, token, expiresAt });

    const headerList = await headers();
    const host = headerList.get("host");
    const protocol = host?.startsWith("localhost") || host?.startsWith("127.0.0.1") ? "http" : "https";
    const resetUrl = `${protocol}://${host}/reset-password/${token}`;

    await sendEmail({
      to: user.email,
      subject: t("email.subject"),
      text: t("email.body", { url: resetUrl }),
    });
  }

  return { sent: true };
}
