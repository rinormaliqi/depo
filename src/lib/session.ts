import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { memberships } from "@/db/schema";

// Assumes one org per user for now — no multi-org switching UI yet.
export async function getMySession() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const [membership] = await db
    .select()
    .from(memberships)
    .where(eq(memberships.userId, session.user.id))
    .limit(1);
  if (!membership) return null;

  return { userId: session.user.id, organizationId: membership.organizationId };
}

export async function requireSession() {
  const result = await getMySession();
  if (!result) {
    throw new Error("Not authenticated or no organization membership");
  }
  return result;
}

export async function getMyOrgId() {
  const result = await getMySession();
  return result?.organizationId ?? null;
}

export async function requireOrgId() {
  return (await requireSession()).organizationId;
}
