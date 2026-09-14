import { and, eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import { memberships, organizations, users } from "@/db/schema";
import { appBaseUrl } from "@/lib/app-url";
import { sendEmail } from "@/lib/email";

// How far ahead of the trial end / paid_until the heads-up goes out.
const REMINDER_DAYS = 7;

// There's no scheduler in this app (docs/architecture.md: no background
// jobs for MVP), so the "your access ends in a week" email is sent lazily:
// getBillingSummary() — which every page's header calls — invokes this,
// and expiry_reminder_sent_for makes it fire once per period. The trade-off
// is honest: an org nobody opens for a week gets no reminder, but an org
// nobody opens isn't the one that needs to renew on time either. Only the
// admins get the mail — they're the only ones who can act on it.
export async function maybeSendExpiryReminder(organizationId: string) {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId));
  if (!org) return;

  const kind = org.subscriptionStatus === "trialing" ? "trial" : org.subscriptionStatus === "active" ? "paid" : null;
  const endsAt = kind === "trial" ? org.trialEndsAt : kind === "paid" ? org.paidUntil : null;
  if (!kind || !endsAt) return;

  const msLeft = endsAt.getTime() - Date.now();
  if (msLeft <= 0 || msLeft > REMINDER_DAYS * 24 * 60 * 60 * 1000) return;
  // Second-level tolerance: paid_until can carry Postgres microseconds
  // that the JS Date we stored the marker from never had.
  if (org.expiryReminderSentFor && Math.abs(org.expiryReminderSentFor.getTime() - endsAt.getTime()) < 1000) return;

  // Claim the period before sending so two concurrent page loads can't
  // both mail; a failed send after the claim is acceptable (one missed
  // reminder beats a duplicate).
  const claimed = await db
    .update(organizations)
    .set({ expiryReminderSentFor: endsAt })
    .where(eq(organizations.id, organizationId))
    .returning({ id: organizations.id });
  if (claimed.length === 0) return;

  const admins = await db
    .select({ email: users.email })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(and(eq(memberships.organizationId, organizationId), eq(memberships.role, "admin")));
  const t = await getTranslations("billing.reminderEmail");
  const url = `${await appBaseUrl()}/billing`;
  const days = Math.max(1, Math.ceil(msLeft / (24 * 60 * 60 * 1000)));

  await Promise.all(
    admins.map((a) =>
      sendEmail({
        to: a.email,
        subject: t(`${kind}.subject`, { org: org.name, days }),
        text: t(`${kind}.body`, { org: org.name, days, url }),
      }).catch((e) => console.error("[billing] reminder email failed", e)),
    ),
  );
}
