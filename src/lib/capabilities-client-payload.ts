import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { memberships, users } from "@/db/schema";
import { CAPABILITIES, blockMessage, getCapabilities } from "@/lib/capabilities";
import { getMySession } from "@/lib/session";
import type { ClientCapabilities } from "@/components/capabilities";

// What the root layout passes to <CapabilitiesProvider>: the resolved
// capabilities plus, for each blocked one, the translated reason — so
// the client never needs the translation tables for this.
export async function capabilitiesForClient(): Promise<ClientCapabilities | null> {
  const caps = await getCapabilities();
  if (!caps) return null;
  const messages: ClientCapabilities["messages"] = {};
  await Promise.all(
    CAPABILITIES.map(async (c) => {
      const reason = caps.reason[c];
      if (reason) messages[c] = await blockMessage(reason, c);
    }),
  );
  // When the org is locked, non-admins need to know whom to ask — the
  // banner names the admins. Loaded only then; it's a per-request cost.
  let admins: ClientCapabilities["admins"] = [];
  if (caps.locked) {
    const session = await getMySession();
    if (session) {
      admins = await db
        .select({ name: users.name, email: users.email })
        .from(memberships)
        .innerJoin(users, eq(memberships.userId, users.id))
        .where(and(eq(memberships.organizationId, session.organizationId), eq(memberships.role, "admin")));
    }
  }
  return { ...caps, messages, admins };
}
