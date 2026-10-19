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
  // transaction, so it falls back to the app connection.
  done: boolean;
};

export const tenantContext = new AsyncLocalStorage<TenantContext>();

export function activeTenant(): TenantContext | null {
  const ctx = tenantContext.getStore();
  return ctx && !ctx.done ? ctx : null;
}

// Code running inside asOwner() (src/lib/tenant.ts): the deliberate
// cross-company paths — sign-up, invites by token, the company switcher,
// account deletion, /internal, the Paysera callback. There `db` is the
// owner connection, which row-level security doesn't apply to.
export const ownerContext = new AsyncLocalStorage<true>();

export function inOwnerScope(): boolean {
  return ownerContext.getStore() === true;
}

// Runs fn on the owner connection, which row-level security doesn't apply
// to — for the paths that work across companies on purpose (sign-up,
// invites by token, the company switcher, account deletion, /internal, the
// Paysera callback). Every caller is a deliberate exception; grep for it.
// Inside an open company transaction it is refused: mixing the two would
// silently widen what that request can see.
export function asOwner<T>(fn: () => Promise<T>): Promise<T> {
  if (activeTenant()) return Promise.reject(new Error("asOwner: called inside a company transaction"));
  return ownerContext.run(true, fn);
}
