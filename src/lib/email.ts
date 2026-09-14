// A raw fetch() to Resend's REST API rather than their SDK — the whole
// integration is one POST request, so a new npm dependency buys nothing.
// Resend (not some SMTP relay) because its free tier needs no separate
// paid infra, matching every other cost call this project has made.
//
// Without RESEND_API_KEY set (any environment that hasn't configured one
// yet — this repo's own local dev included), emails log to the server
// console instead of failing outright, so every flow that sends one stays
// testable before there's a real API key or a verified sending domain to
// send from (both genuinely require a deployed app with its own domain —
// see the "Deploy a real production instance" work).
const RESEND_API_URL = "https://api.resend.com/emails";

export async function sendEmail({ to, subject, text }: { to: string; subject: string; text: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "SmartDepo <onboarding@resend.dev>";

  if (!apiKey) {
    console.log(`[email] RESEND_API_KEY not set — logging instead of sending.\nTo: ${to}\nSubject: ${subject}\n\n${text}`);
    return;
  }

  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, text }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to send email (${res.status}): ${body}`);
  }
}
