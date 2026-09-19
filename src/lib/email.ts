import nodemailer from "nodemailer";
import { companyInfo } from "@/lib/company";

// Two ways out, picked by what's configured:
//
// 1. SMTP (`SMTP_HOST`/`SMTP_USER`/`SMTP_PASS`) — in production this is the
//    company Gmail account with an App Password. Chosen over a transactional
//    provider for launch because it needs no verified sending domain: Resend
//    and friends only let you send *from* a domain you own and have DNS for,
//    and until there is one, a Gmail address is the real sender identity.
//    Gmail caps at ~500 messages/day, which is far beyond verification +
//    reset + invite volume for the first customers.
// 2. Resend (`RESEND_API_KEY`) — a raw fetch() to their REST API rather than
//    the SDK; the whole integration is one POST. The path to move to once
//    a domain is verified there.
//
// With neither set (this repo's own local dev included), emails log to the
// server console instead of failing, so every flow that sends one stays
// testable. Replies go to the support address either way.
const RESEND_API_URL = "https://api.resend.com/emails";

type Mail = { to: string; subject: string; text: string; replyTo?: string };

function smtpConfig() {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  const port = Number(process.env.SMTP_PORT) || 465;
  return { host, port, secure: port === 465, auth: { user, pass } };
}

function fromAddress() {
  const user = process.env.SMTP_USER?.trim();
  return process.env.EMAIL_FROM || (user ? `SmartDepo <${user}>` : "SmartDepo <onboarding@resend.dev>");
}

export async function sendEmail({ to, subject, text, replyTo: replyToOverride }: Mail) {
  const from = fromAddress();
  // Replies go to support — except mail we send *to* support on someone
  // else's behalf (the contact form), where the sender is the reply-to.
  const replyTo = replyToOverride || companyInfo().supportEmail || undefined;
  const smtp = smtpConfig();

  if (smtp) {
    const transport = nodemailer.createTransport(smtp);
    await transport.sendMail({ from, to, subject, text, replyTo });
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[email] neither SMTP_* nor RESEND_API_KEY set — logging instead of sending.\nTo: ${to}\nSubject: ${subject}\n\n${text}`);
    return;
  }

  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, text, reply_to: replyTo }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to send email (${res.status}): ${body}`);
  }
}
