"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { memberships, organizations, users } from "@/db/schema";
import { signOutEverywhere } from "@/lib/account";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { recordAdminAction } from "@/lib/admin-audit";
import { attempt } from "@/lib/action-result";
import { UserError } from "@/lib/user-error";

// Explicit columns, never passwordHash — this goes straight to the client.
export async function listUsersForAdmin() {
  await requirePlatformAdmin();

  const [allUsers, allMemberships] = await Promise.all([
    db
      .select({ id: users.id, email: users.email, name: users.name, emailVerifiedAt: users.emailVerifiedAt, disabledAt: users.disabledAt, disabledReason: users.disabledReason, createdAt: users.createdAt })
      .from(users)
      .orderBy(users.createdAt),
    db
      .select({ userId: memberships.userId, organizationId: memberships.organizationId, role: memberships.role, orgName: organizations.name })
      .from(memberships)
      .innerJoin(organizations, eq(memberships.organizationId, organizations.id)),
  ]);

  const membershipsByUser = new Map<string, { organizationId: string; orgName: string; role: string }[]>();
  for (const m of allMemberships) {
    const arr = membershipsByUser.get(m.userId) ?? [];
    arr.push({ organizationId: m.organizationId, orgName: m.orgName, role: m.role });
    membershipsByUser.set(m.userId, arr);
  }

  return allUsers.map((u) => ({ ...u, memberships: membershipsByUser.get(u.id) ?? [] }));
}

async function forceSignOutImpl(userId: string) {
  await requirePlatformAdmin();
  await signOutEverywhere(userId);
  await recordAdminAction({ action: "user.forceSignOut", targetType: "user", targetId: userId });
  revalidatePath("/internal");
}

export async function forceSignOut(userId: string) {
  return attempt(() => forceSignOutImpl(userId), "forceSignOut");
}

async function disableUserImpl(userId: string, reason: string) {
  await requirePlatformAdmin();
  const trimmed = reason.trim();
  if (!trimmed) throw new UserError("A reason is required to disable an account");

  await db.update(users).set({ disabledAt: new Date(), disabledReason: trimmed }).where(eq(users.id, userId));
  // Blocks the next login; also end whatever session is open right now,
  // the same way suspending an organization has to act immediately.
  await signOutEverywhere(userId);
  await recordAdminAction({ action: "user.disable", targetType: "user", targetId: userId, metadata: { reason: trimmed } });
  revalidatePath("/internal");
}

export async function disableUser(userId: string, reason: string) {
  return attempt(() => disableUserImpl(userId, reason), "disableUser");
}

async function reactivateUserImpl(userId: string) {
  await requirePlatformAdmin();
  await db.update(users).set({ disabledAt: null, disabledReason: null }).where(eq(users.id, userId));
  await recordAdminAction({ action: "user.reactivate", targetType: "user", targetId: userId });
  revalidatePath("/internal");
}

export async function reactivateUser(userId: string) {
  return attempt(() => reactivateUserImpl(userId), "reactivateUser");
}
