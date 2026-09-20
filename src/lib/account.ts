import { randomBytes } from "crypto";
import { compare, hash } from "bcryptjs";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import {
  contactMessages, emailChanges, facilities, invites, items, locations, memberships, movements, organizations, payments, stock, users,
} from "@/db/schema";
import { appBaseUrl } from "@/lib/app-url";
import { sendEmail } from "@/lib/email";
import { isDisposableEmail, normalizeEmail } from "@/lib/email-normalize";
import { UserError } from "@/lib/user-error";

// Everything a signed-in person can do to their own account (#75). Pure
// server logic; src/app/account/actions.ts wraps it in session checks.

const EMAIL_CHANGE_VALID_HOURS = 24;
const MIN_PASSWORD = 8;

export async function updateName(userId: string, rawName: string) {
  const t = await getTranslations("account.error");
  const name = rawName.trim();
  if (!name) throw new UserError(t("nameRequired"));
  await db.update(users).set({ name }).where(eq(users.id, userId));
}

// A password user must prove the current one; a Google-only user has none
// to prove and is simply setting their first.
export async function changePassword(userId: string, current: string | undefined, next: string) {
  const t = await getTranslations("account.error");
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) throw new UserError(t("notSignedIn"));
  if (next.length < MIN_PASSWORD) throw new UserError(t("passwordLength", { min: MIN_PASSWORD }));
  if (user.passwordHash) {
    if (!current || !(await compare(current, user.passwordHash))) throw new UserError(t("wrongCurrentPassword"));
  }
  await db.update(users).set({ passwordHash: await hash(next, 12) }).where(eq(users.id, userId));
}

// Step 1 of an email change: validate the new address the way signup
// does, store it as pending, mail a confirmation link *to the new inbox*.
export async function requestEmailChange(userId: string, rawEmail: string) {
  const t = await getTranslations("account.error");
  const email = rawEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new UserError(t("emailInvalid"));
  if (isDisposableEmail(email)) throw new UserError(t("emailDisposable"));
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) throw new UserError(t("notSignedIn"));
  const normalizedEmail = normalizeEmail(email);
  if (normalizedEmail === user.normalizedEmail && email === user.email) throw new UserError(t("emailSame"));
  const [taken] = await db.select({ id: users.id }).from(users).where(and(eq(users.normalizedEmail, normalizedEmail), ne(users.id, userId)));
  if (taken) throw new UserError(t("emailTaken"));

  // One pending change at a time: an older link must not win a race.
  await db.update(emailChanges).set({ usedAt: new Date() }).where(and(eq(emailChanges.userId, userId), isNull(emailChanges.usedAt)));
  const token = randomBytes(32).toString("hex");
  await db.insert(emailChanges).values({ userId, newEmail: email, token, expiresAt: new Date(Date.now() + EMAIL_CHANGE_VALID_HOURS * 3600_000) });
  const te = await getTranslations("account.emailChange.email");
  const url = `${await appBaseUrl()}/account/confirm-email/${token}`;
  await sendEmail({ to: email, subject: te("subject"), text: te("body", { url, hours: EMAIL_CHANGE_VALID_HOURS }) });
  return { email };
}

// Step 2: the link from the new inbox. The uniqueness check runs again —
// someone else may have taken the address in the meantime.
export type EmailChangeOutcome = { ok: true; email: string } | { ok: false; reason: "expired" | "used" | "unknown" | "taken" };
export async function confirmEmailChange(token: string): Promise<EmailChangeOutcome> {
  const [row] = await db.select().from(emailChanges).where(eq(emailChanges.token, token));
  if (!row) return { ok: false, reason: "unknown" };
  if (row.usedAt) return { ok: false, reason: "used" };
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };
  const normalizedEmail = normalizeEmail(row.newEmail);
  const [taken] = await db.select({ id: users.id }).from(users).where(and(eq(users.normalizedEmail, normalizedEmail), ne(users.id, row.userId)));
  if (taken) return { ok: false, reason: "taken" };
  await db.transaction(async (tx) => {
    await tx.update(users).set({ email: row.newEmail, normalizedEmail, emailVerifiedAt: new Date() }).where(eq(users.id, row.userId));
    await tx.update(emailChanges).set({ usedAt: new Date() }).where(eq(emailChanges.id, row.id));
  });
  return { ok: true, email: row.newEmail };
}

// Every existing JWT carries the old number and is refused from now on.
export async function signOutEverywhere(userId: string) {
  await db.update(users).set({ sessionVersion: sql`${users.sessionVersion} + 1` }).where(eq(users.id, userId));
}

// Deleting an account is erasure, not row removal: movements keep their
// performed_by (the history of a depot must stay complete), so the user
// row stays and loses everything personal. Organizations where this was
// the only member are deleted outright with their data; where others
// remain, the only admin must hand over first.
export async function deleteAccount(userId: string) {
  const t = await getTranslations("account.error");
  const mine = await db
    .select({ id: memberships.id, organizationId: memberships.organizationId, role: memberships.role, orgName: organizations.name })
    .from(memberships)
    .innerJoin(organizations, eq(memberships.organizationId, organizations.id))
    .where(eq(memberships.userId, userId));

  const soleMemberOrgs: string[] = [];
  for (const m of mine) {
    const others = await db.select({ id: memberships.id, role: memberships.role }).from(memberships).where(and(eq(memberships.organizationId, m.organizationId), ne(memberships.userId, userId)));
    if (others.length === 0) {
      soleMemberOrgs.push(m.organizationId);
    } else if (m.role === "admin" && !others.some((o) => o.role === "admin")) {
      throw new UserError(t("lastAdminOf", { org: m.orgName }));
    }
  }

  await db.transaction(async (tx) => {
    for (const orgId of soleMemberOrgs) {
      // Bottom-up through the foreign keys that don't cascade.
      await tx.delete(movements).where(eq(movements.organizationId, orgId));
      const facs = await tx.select({ id: facilities.id }).from(facilities).where(eq(facilities.organizationId, orgId));
      for (const f of facs) {
        const locs = await tx.select({ id: locations.id }).from(locations).where(eq(locations.facilityId, f.id));
        if (locs.length) await tx.delete(stock).where(sql`${stock.locationId} in ${sql.raw(`(${locs.map((l) => `'${l.id}'`).join(",")})`)}`);
        await tx.delete(locations).where(eq(locations.facilityId, f.id));
      }
      await tx.delete(facilities).where(eq(facilities.organizationId, orgId));
      await tx.delete(items).where(eq(items.organizationId, orgId));
      await tx.delete(invites).where(eq(invites.organizationId, orgId));
      await tx.delete(payments).where(eq(payments.organizationId, orgId));
      await tx.delete(memberships).where(eq(memberships.organizationId, orgId));
      await tx.delete(organizations).where(eq(organizations.id, orgId));
    }
    await tx.delete(memberships).where(eq(memberships.userId, userId));
    await tx.delete(invites).where(eq(invites.invitedBy, userId));
    await tx.update(contactMessages).set({ userId: null }).where(eq(contactMessages.userId, userId));
    await tx
      .update(users)
      .set({
        email: `deleted-${userId}@deleted.invalid`,
        normalizedEmail: `deleted-${userId}@deleted.invalid`,
        name: "—",
        passwordHash: null,
        emailVerifiedAt: null,
        sessionVersion: sql`${users.sessionVersion} + 1`,
      })
      .where(eq(users.id, userId));
  });
}
