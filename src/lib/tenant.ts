import { sql } from "drizzle-orm";
import { pool } from "@/db";
import { activeTenant, tenantContext, type TenantContext } from "@/db/tenant-context";
import { isNavigationError } from "@/lib/action-result";
import { getMySession } from "@/lib/session";

type TenantSession = Pick<TenantContext, "organizationId" | "userId" | "role">;

// Row-level security, phase 2 (#228): runs fn inside one transaction as
// app_user, with the company and person set for the policies in
// drizzle/0026_rls_policies.sql. Every `db` call inside — however deep —
// uses that transaction (src/db/index.ts), so a query that forgets its
// organization filter gets this company's rows or none, never another's.
//
// The whole call is one transaction: a failure part-way rolls back what
// it had written. redirect()/notFound() are navigations, not failures, so
// they commit first and are rethrown after.
export async function withOrg<T>(session: TenantSession, fn: () => Promise<T>): Promise<T> {
  const current = activeTenant();
  if (current) {
    // Nested call (an action reusing another): same transaction.
    if (current.organizationId !== session.organizationId) {
      throw new Error("withOrg: already inside another organization's transaction");
    }
    return fn();
  }

  let navigation: unknown = null;
  let ctx: TenantContext | null = null;
  try {
    const result = await pool.transaction(async (tx) => {
      // One round trip: set_config('role', …) is SET LOCAL ROLE.
      await tx.execute(
        sql`select set_config('role', 'app_user', true), set_config('app.org_id', ${session.organizationId}, true), set_config('app.user_id', ${session.userId}, true)`,
      );
      ctx = { ...session, tx, done: false };
      return tenantContext.run(ctx, async () => {
        try {
          return await fn();
        } catch (e) {
          if (!isNavigationError(e)) throw e;
          navigation = e;
          return undefined as T;
        }
      });
    });
    if (navigation) throw navigation;
    return result;
  } finally {
    if (ctx) (ctx as TenantContext).done = true;
  }
}

// The usual entry point: fn in the signed-in person's current company.
// With no session (or no company yet) fn runs as it always did, and its
// own requireSession()/getMyFacility() refuse it or come back empty
// exactly as before — so wrapping an action changes nothing for a
// signed-out caller.
export async function inOrg<T>(fn: () => Promise<T>): Promise<T> {
  if (activeTenant()) return fn();
  const session = await getMySession();
  return session ? withOrg(session, fn) : fn();
}
