"use server";

import { randomBytes } from "crypto";
import { and, eq, isNull, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import { invites, memberships, membershipRoles, organizations, type MembershipRole, users } from "@/db/schema";
import { appBaseUrl } from "@/lib/app-url";
import { sendEmail } from "@/lib/email";
import { normalizeEmail } from "@/lib/email-normalize";
import { requirePermission } from "@/lib/permissions";
import { assertCanAddSeats } from "@/lib/plan-limits";
import { requireSession } from "@/lib/session";
import { attempt } from "@/lib/action-result";
import { UserError } from "@/lib/user-error";

const INVITE_VALID_DAYS = 7;

function expiryFromNow() {
  const d = new Date();
  d.setDate(d.getDate() + INVITE_VALID_DAYS);
  return d;
}

function isRole(value: unknown): value is MembershipRole {
  return typeof value === "string" && (membershipRoles as readonly string[]).includes(value);
}

export async function getTeam() {
  const session = await requireSession();

  const members = await db
    .select({ id: memberships.id, userId: memberships.userId, role: memberships.role, name: users.name, email: users.email, createdAt: memberships.createdAt })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(eq(memberships.organizationId, session.organizationId))
    .orderBy(users.name);

  const pendingInvites = await db
    .select()
    .from(invites)
    .where(and(eq(invites.organizationId, session.organizationId), isNull(invites.acceptedAt)))
    .orderBy(invites.createdAt);

  return {
    members,
    pendingInvites,
    canManage: session.role === "admin" || session.role === "manager",
    isAdmin: session.role === "admin",
    myUserId: session.userId,
  };
}

// The invite mail itself. Sent on create and on resend; the copyable link
// on /team stays as a fallback for a teammate whose inbox is unreliable
// (or a company that doesn't do email for floor staff at all).
async function sendInviteEmail(invite: { email: string; token: string; role: MembershipRole; organizationId: string; invitedBy: string }) {
  const t = await getTranslations("team.email");
  const tr = await getTranslations("team.role");
  const [org] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, invite.organizationId));
  const [inviter] = await db.select({ name: users.name }).from(users).where(eq(users.id, invite.invitedBy));
  const url = `${await appBaseUrl()}/invite/${invite.token}`;
  await sendEmail({
    to: invite.email,
    subject: t("subject", { org: org?.name ?? "SmartDepo" }),
    text: t("body", { inviter: inviter?.name ?? "", org: org?.name ?? "", role: tr(invite.role), url, days: INVITE_VALID_DAYS }),
  });
}

export async function createInvite(_prevState: { error?: string } | undefined, formData: FormData) {
  const t = await getTranslations("team.error");
  let session: Awaited<ReturnType<typeof requireSession>>;
  try {
    session = await requirePermission("manageTeam");
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  const email = formData.get("email")?.toString().trim().toLowerCase();
  const role = formData.get("role")?.toString();

  if (!email || !isRole(role)) return { error: t("required") };
  if (role === "admin" && session.role !== "admin") return { error: t("onlyAdminCanInviteAdmin") };

  const [existingUser] = await db.select().from(users).where(eq(users.normalizedEmail, normalizeEmail(email)));
  if (existingUser) {
    const [existingMembership] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.userId, existingUser.id), eq(memberships.organizationId, session.organizationId)));
    if (existingMembership) return { error: t("alreadyMember") };
  }

  const expiresAt = expiryFromNow();
  const [existingInvite] = await db
    .select()
    .from(invites)
    .where(and(eq(invites.organizationId, session.organizationId), eq(invites.email, email), isNull(invites.acceptedAt)));

  let invite: typeof invites.$inferSelect;
  if (existingInvite) {
    // Refreshing an already-pending invite (role change, resend) doesn't
    // consume a new seat — it's already counted in the existing-invites
    // query inside assertCanAddSeats, so no limit check here.
    [invite] = await db
      .update(invites)
      .set({ role, expiresAt, invitedBy: session.userId })
      .where(eq(invites.id, existingInvite.id))
      .returning();
  } else {
    try {
      await assertCanAddSeats(session.organizationId, 1);
    } catch (e) {
      return { error: e instanceof Error ? e.message : t("notAuthorized") };
    }
    [invite] = await db
      .insert(invites)
      .values({
        organizationId: session.organizationId,
        email,
        role,
        token: randomBytes(32).toString("hex"),
        invitedBy: session.userId,
        expiresAt,
      })
      .returning();
  }

  try {
    await sendInviteEmail(invite);
  } catch {
    // The invite row exists and its link is on /team — a mail provider
    // hiccup shouldn't throw away the seat, just tell the inviter.
    revalidatePath("/team");
    return { error: t("emailFailed") };
  }

  revalidatePath("/team");
}

async function loadOwnInvite(inviteId: string, organizationId: string) {
  const t = await getTranslations("team.error");
  const [invite] = await db.select().from(invites).where(eq(invites.id, inviteId));
  if (!invite || invite.organizationId !== organizationId) throw new UserError(t("inviteNotFound"));
  return invite;
}

async function revokeInviteImpl(inviteId: string) {
  const session = await requirePermission("manageTeam");
  const invite = await loadOwnInvite(inviteId, session.organizationId);
  await db.delete(invites).where(eq(invites.id, invite.id));
  revalidatePath("/team");
}

async function resendInviteImpl(inviteId: string) {
  const session = await requirePermission("manageTeam");
  const invite = await loadOwnInvite(inviteId, session.organizationId);
  const [updated] = await db.update(invites).set({ expiresAt: expiryFromNow() }).where(eq(invites.id, invite.id)).returning();
  await sendInviteEmail(updated);
  revalidatePath("/team");
}

// Guards shared by role changes and removals: the target must be in this
// org, and the org can never be left without an admin — otherwise nobody
// could ever manage the team or billing again.
async function loadOwnMembership(membershipId: string, organizationId: string) {
  const t = await getTranslations("team.error");
  const [membership] = await db.select().from(memberships).where(eq(memberships.id, membershipId));
  if (!membership || membership.organizationId !== organizationId) throw new UserError(t("memberNotFound"));
  return membership;
}

async function assertNotLastAdmin(membership: typeof memberships.$inferSelect) {
  if (membership.role !== "admin") return;
  const others = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.organizationId, membership.organizationId), eq(memberships.role, "admin"), ne(memberships.id, membership.id)));
  if (others.length === 0) {
    const t = await getTranslations("team.error");
    throw new UserError(t("lastAdmin"));
  }
}

async function changeMemberRoleImpl(membershipId: string, role: string) {
  const t = await getTranslations("team.error");
  const session = await requirePermission("manageTeam");
  if (!isRole(role)) throw new UserError(t("required"));

  const membership = await loadOwnMembership(membershipId, session.organizationId);
  // A manager can shuffle workers/managers but never touch an admin seat
  // in either direction — same cap as inviting.
  if (session.role !== "admin" && (role === "admin" || membership.role === "admin")) throw new UserError(t("onlyAdminCanChangeAdmin"));
  if (membership.role === role) return;
  if (membership.role === "admin") await assertNotLastAdmin(membership);

  await db.update(memberships).set({ role }).where(eq(memberships.id, membership.id));
  revalidatePath("/team");
}

async function removeMemberImpl(membershipId: string) {
  const t = await getTranslations("team.error");
  const session = await requirePermission("manageTeam");

  const membership = await loadOwnMembership(membershipId, session.organizationId);
  if (session.role !== "admin" && membership.role === "admin") throw new UserError(t("onlyAdminCanChangeAdmin"));
  if (membership.userId === session.userId) throw new UserError(t("cannotRemoveSelf"));
  if (membership.role === "admin") await assertNotLastAdmin(membership);

  // The membership is the only thing tying the user to this org; the
  // user row (and any other org they're in) is untouched. Movements they
  // logged keep their user_id, so history stays attributable.
  await db.delete(memberships).where(eq(memberships.id, membership.id));
  revalidatePath("/team");
}

export async function revokeInvite(inviteId: string) {
  return attempt(() => revokeInviteImpl(inviteId), "revokeInvite");
}

export async function resendInvite(inviteId: string) {
  return attempt(() => resendInviteImpl(inviteId), "resendInvite");
}

export async function changeMemberRole(membershipId: string, role: string) {
  return attempt(() => changeMemberRoleImpl(membershipId, role), "changeMemberRole");
}

export async function removeMember(membershipId: string) {
  return attempt(() => removeMemberImpl(membershipId), "removeMember");
}
