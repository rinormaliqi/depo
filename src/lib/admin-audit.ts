import { auth } from "@/auth";
import { db } from "@/db";
import { adminAuditLog, type AdminAuditTargetType } from "@/db/schema";

// Called from inside an action already gated by requirePlatformAdmin() —
// doesn't re-check admin-ness itself, just records who (from the session,
// never a caller-supplied value) did what to which organization/user.
export async function recordAdminAction(input: {
  action: string;
  targetType: AdminAuditTargetType;
  targetId: string;
  metadata?: Record<string, unknown>;
}) {
  const session = await auth();
  const actorEmail = session?.user?.email;
  if (!actorEmail) throw new Error("recordAdminAction: no authenticated session");

  await db.insert(adminAuditLog).values({
    actorEmail,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    metadata: input.metadata,
  });
}
