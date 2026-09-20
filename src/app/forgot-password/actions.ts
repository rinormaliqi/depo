"use server";

import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import { appBaseUrl } from "@/lib/app-url";
import { passwordResets, users } from "@/db/schema";
import { sendEmail } from "@/lib/email";
import { LIMITS, clientIp, isLimited, record } from "@/lib/rate-limit";

const RESET_VALID_MINUTES = 60;

type FormState = { error?: string; sent?: boolean } | undefined;

export async function requestPasswordReset(_prevState: FormState, formData: FormData): Promise<FormState> {
  const t = await getTranslations("forgotPassword");
  const email = formData.get("email")?.toString().trim().toLowerCase();
  if (!email) return { error: t("error.required") };

  // Over the limit → the same "sent" screen, nothing sent: a flood of
  // requests must not turn into a flood of mail, and must not reveal
  // whether the address exists.
  const ipKey = `forgot:ip:${await clientIp()}`;
  const emailKey = `forgot:email:${email}`;
  if ((await isLimited(ipKey, LIMITS.forgotPassword)) || (await isLimited(emailKey, LIMITS.forgotPassword))) return { sent: true };
  await Promise.all([record(ipKey), record(emailKey)]);

  const [user] = await db.select().from(users).where(eq(users.email, email));

  // Always report success, whether or not that email has an account —
  // confirming/denying it here would let anyone enumerate real accounts by
  // email. The visible outcome is identical either way; only the send
  // (or not) differs.
  if (user) {
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + RESET_VALID_MINUTES * 60 * 1000);
    await db.insert(passwordResets).values({ userId: user.id, token, expiresAt });

    const resetUrl = `${await appBaseUrl()}/reset-password/${token}`;

    await sendEmail({
      to: user.email,
      subject: t("email.subject"),
      text: t("email.body", { url: resetUrl }),
    });
  }

  return { sent: true };
}
