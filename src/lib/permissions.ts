import { getTranslations } from "next-intl/server";
import type { MembershipRole } from "@/db/schema";
import { requireActiveOrg, requireSession } from "@/lib/session";

// What each role may do. Roles were stored on memberships from the start
// but only the invite flow ever read them — a worker could redraw the
// whole floor plan. This table is the single place that answers "can this
// role do X"; every mutating server action asks it via requirePermission().
//
// The shape follows how a depot actually runs: workers are on the floor
// moving stock all day and should never be able to reshape the layout by
// accident; managers run the depot day to day (layout, catalog, staffing)
// but don't hold the company's wallet; admins are the account owners.
export const PERMISSIONS = {
  // Stock in/out via scanner or bin page — the worker's whole job.
  moveStock: ["admin", "manager", "worker"],
  // Blueprint: add/move/resize/delete locations, floor settings, templates.
  editLayout: ["admin", "manager"],
  // Create items in the catalog.
  manageItems: ["admin", "manager"],
  // Invite / remove / re-role members (inviting an admin is admin-only on
  // top of this — see team/actions.ts).
  manageTeam: ["admin", "manager"],
  // Plan changes and payment — the account owner only.
  manageBilling: ["admin"],
} as const satisfies Record<string, readonly MembershipRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: MembershipRole, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly MembershipRole[]).includes(role);
}

// The write-path gate: org must be unlocked AND the caller's role must
// carry the permission. Throws a translated message either way, so a
// client can surface it as-is.
export async function requirePermission(permission: Permission) {
  const session = await requireActiveOrg();
  if (!can(session.role, permission)) {
    const t = await getTranslations("permission");
    throw new Error(t(permission));
  }
  return session;
}

// Read-side variant for pages deciding what to render (e.g. hide the
// builder's palette for a worker) — doesn't care whether the org is locked.
export async function getMyPermissions() {
  const session = await requireSession();
  const granted = {} as Record<Permission, boolean>;
  for (const key of Object.keys(PERMISSIONS) as Permission[]) granted[key] = can(session.role, key);
  return { role: session.role, ...granted };
}
