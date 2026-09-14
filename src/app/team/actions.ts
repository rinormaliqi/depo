"use server";

import { randomBytes } from "crypto";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import { invites, memberships, type MembershipRole, users } from "@/db/schema";
import { assertCanAddSeats } from "@/lib/plan-limits";
import { requireActiveOrg, requireSession } from "@/lib/session";

const INVITE_VALID_DAYS = 7;

function expiryFromNow() {
  const d = new Date();
  d.setDate(d.getDate() + INVITE_VALID_DAYS);
  return d;
}

function isManager(role: MembershipRole) {
  return role === "admin" || role === "manager";
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

  return { members, pendingInvites, canManage: isManager(session.role), myUserId: session.userId };
}

export async function createInvite(_prevState: { error?: string } | undefined, formData: FormData) {
  const t = await getTranslations("team.error");
  let session: Awaited<ReturnType<typeof requireSession>>;
  try {
    session = await requireActiveOrg();
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  if (!isManager(session.role)) return { error: t("notAuthorized") };

  const email = formData.get("email")?.toString().trim().toLowerCase();
  const role = formData.get("role")?.toString() as MembershipRole | undefined;

  if (!email || !role) return { error: t("required") };
  if (role === "admin" && session.role !== "admin") return { error: t("onlyAdminCanInviteAdmin") };

  const [existingUser] = await db.select().from(users).where(eq(users.email, email));
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

  if (existingInvite) {
    // Refreshing an already-pending invite (role change, resend) doesn't
    // consume a new seat — it's already counted in the existing-invites
    // query inside assertCanAddSeats, so no limit check here.
    await db.update(invites).set({ role, expiresAt, invitedBy: session.userId }).where(eq(invites.id, existingInvite.id));
  } else {
    try {
      await assertCanAddSeats(session.organizationId, 1);
    } catch (e) {
      return { error: e instanceof Error ? e.message : t("notAuthorized") };
    }
    await db.insert(invites).values({
      organizationId: session.organizationId,
      email,
      role,
      token: randomBytes(32).toString("hex"),
      invitedBy: session.userId,
      expiresAt,
    });
  }

  revalidatePath("/team");
}

export async function revokeInvite(inviteId: string) {
  const t = await getTranslations("team.error");
  const session = await requireActiveOrg();
  if (!isManager(session.role)) throw new Error(t("notAuthorized"));

  const [invite] = await db.select().from(invites).where(eq(invites.id, inviteId));
  if (!invite || invite.organizationId !== session.organizationId) throw new Error(t("inviteNotFound"));

  await db.delete(invites).where(eq(invites.id, inviteId));
  revalidatePath("/team");
}

export async function resendInvite(inviteId: string) {
  const t = await getTranslations("team.error");
  const session = await requireActiveOrg();
  if (!isManager(session.role)) throw new Error(t("notAuthorized"));

  const [invite] = await db.select().from(invites).where(eq(invites.id, inviteId));
  if (!invite || invite.organizationId !== session.organizationId) throw new Error(t("inviteNotFound"));

  await db.update(invites).set({ expiresAt: expiryFromNow() }).where(eq(invites.id, inviteId));
  revalidatePath("/team");
}
