"use server";

import { and, eq, gt, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { contactMessages } from "@/db/schema";
import { companyInfo } from "@/lib/company";
import { sendEmail } from "@/lib/email";

export type ContactState = { ok?: true; error?: string; at?: number } | undefined;

// Bots fill every field and submit instantly; people don't. A filled
// honeypot or a sub-2-second submit is accepted with a smile and dropped —
// no error to learn from. Real abuse is capped per IP per hour.
const MIN_FILL_MS = 2000;
const MAX_PER_IP_PER_HOUR = 5;
const MAX_MESSAGE = 4000;

export async function sendContactMessage(_prev: ContactState, formData: FormData): Promise<ContactState> {
  const t = await getTranslations("public.contact.form");
  const name = formData.get("name")?.toString().trim() ?? "";
  const company = formData.get("company")?.toString().trim() || null;
  const email = formData.get("email")?.toString().trim().toLowerCase() ?? "";
  const message = formData.get("message")?.toString().trim() ?? "";
  const honeypot = formData.get("website")?.toString() ?? "";
  const startedAt = Number(formData.get("startedAt"));

  if (honeypot || (Number.isFinite(startedAt) && Date.now() - startedAt < MIN_FILL_MS)) {
    return { ok: true, at: Date.now() };
  }
  if (!name || !email || !message) return { error: t("errorRequired") };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: t("errorEmail") };
  if (message.length > MAX_MESSAGE) return { error: t("errorLong", { max: MAX_MESSAGE }) };

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  if (ip) {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(contactMessages)
      .where(and(eq(contactMessages.ip, ip), gt(contactMessages.createdAt, new Date(Date.now() - 60 * 60 * 1000))));
    if (n >= MAX_PER_IP_PER_HOUR) return { error: t("errorRate") };
  }

  const session = await auth();
  const [row] = await db
    .insert(contactMessages)
    .values({ name, company, email, message, ip, userId: session?.user?.id ?? null })
    .returning();

  const support = companyInfo().supportEmail;
  try {
    await sendEmail({
      to: support,
      replyTo: `${name} <${email}>`,
      subject: `[SmartDepo] ${company ? `${company} — ` : ""}${name}`,
      text: `${message}\n\n—\n${name}${company ? ` · ${company}` : ""}\n${email}${session?.user ? `\n(signed in as ${session.user.email})` : ""}`,
    });
    await db.update(contactMessages).set({ sentAt: new Date() }).where(eq(contactMessages.id, row.id));
  } catch (e) {
    // The row is the fallback: the message isn't lost, it's just not in the inbox yet.
    console.error("[contact] send failed", e);
    return { error: t("errorSend") };
  }
  return { ok: true, at: Date.now() };
}
