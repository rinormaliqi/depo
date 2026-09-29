import { and, eq, gt, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { db } from "@/db";
import { adminViewAsSessions, organizations } from "@/db/schema";
import { recordAdminAction } from "@/lib/admin-audit";
import { isPlatformAdmin, requirePlatformAdmin } from "@/lib/platform-admin";
import { UserError } from "@/lib/user-error";

const COOKIE = "view_as_session";
const DURATION_MS = 30 * 60_000;

// The only code that reads/writes admin_view_as_sessions or the cookie
// naming it — everything else goes through getActiveViewAs()/
// requireActiveViewAs(). The cookie itself carries nothing but an opaque
// row id; the row is what's checked (unexpired, not manually ended, and
// owned by whichever admin is actually signed in right now), so there's
// nothing here worth forging even if the cookie value were guessed.
export async function getActiveViewAs() {
  const session = await auth();
  const adminUserId = session?.user?.id;
  if (!adminUserId) return null;
  // Re-checked on every read, not just at startViewAs(): if admin rights
  // are revoked mid-session (PLATFORM_ADMIN_EMAILS edited), the session
  // must stop resolving immediately, not linger until its 30-minute expiry.
  if (!(await isPlatformAdmin())) return null;

  const jar = await cookies();
  const sessionId = jar.get(COOKIE)?.value;
  if (!sessionId) return null;

  const [row] = await db
    .select()
    .from(adminViewAsSessions)
    .where(and(eq(adminViewAsSessions.id, sessionId), isNull(adminViewAsSessions.endedAt), gt(adminViewAsSessions.expiresAt, new Date())));
  if (!row || row.adminUserId !== adminUserId) return null;

  const [org] = await db.select({ id: organizations.id, name: organizations.name }).from(organizations).where(eq(organizations.id, row.organizationId));
  if (!org) return null;

  return { sessionId: row.id, organizationId: org.id, organizationName: org.name, expiresAt: row.expiresAt };
}

export async function requireActiveViewAs() {
  const viewAs = await getActiveViewAs();
  if (!viewAs) throw new UserError("No active view-as session");
  return viewAs;
}

export async function startViewAs(organizationId: string) {
  await requirePlatformAdmin();
  const session = await auth();
  const adminUserId = session!.user!.id;

  const [org] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, organizationId));
  if (!org) throw new UserError("Organization not found");

  const [row] = await db
    .insert(adminViewAsSessions)
    .values({ adminUserId, organizationId, expiresAt: new Date(Date.now() + DURATION_MS) })
    .returning();

  const jar = await cookies();
  jar.set(COOKIE, row.id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: DURATION_MS / 1000 });
  await recordAdminAction({ action: "org.viewAs.start", targetType: "organization", targetId: organizationId });
}

export async function endViewAs() {
  await requirePlatformAdmin();
  const session = await auth();
  const adminUserId = session?.user?.id;

  const jar = await cookies();
  const sessionId = jar.get(COOKIE)?.value;
  if (sessionId && adminUserId) {
    const [row] = await db.select().from(adminViewAsSessions).where(eq(adminViewAsSessions.id, sessionId));
    if (row && !row.endedAt && row.adminUserId === adminUserId) {
      await db.update(adminViewAsSessions).set({ endedAt: new Date() }).where(eq(adminViewAsSessions.id, sessionId));
      await recordAdminAction({ action: "org.viewAs.end", targetType: "organization", targetId: row.organizationId });
    }
  }
  jar.delete(COOKIE);
}
