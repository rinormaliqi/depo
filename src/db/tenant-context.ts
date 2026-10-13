import { AsyncLocalStorage } from "node:async_hooks";
import type { MembershipRole } from "./schema";
import type { Tx } from "./index";

// The company transaction a request is running in (#228 phase 2), set by
// withOrg() in src/lib/tenant.ts. While it is open, the `db` proxy hands
// out this transaction instead of the pool, so the code inside runs as
// app_user under the row-level security policies without having to pass a
// transaction around.
export type TenantContext = {
  tx: Tx;
  organizationId: string;
  userId: string;
  role: MembershipRole;
  // Set once the transaction has ended. Work started inside it but still
  // running afterwards (a fire-and-forget email) can't use a closed
  // transaction, so it falls back to the pool.
  done: boolean;
};

export const tenantContext = new AsyncLocalStorage<TenantContext>();

export function activeTenant(): TenantContext | null {
  const ctx = tenantContext.getStore();
  return ctx && !ctx.done ? ctx : null;
}
