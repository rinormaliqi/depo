import type { MembershipRole } from "@/db/schema";
import { requireSession } from "@/lib/session";

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

// The write-path gate — delegates to the capability system (role × plan ×
// lock state) so an action and the button that triggers it agree on the
// answer and the reason. Kept under this name because every mutating
// action already calls it.
export async function requirePermission(permission: Permission) {
  const { requireCapability } = await import("@/lib/capabilities");
  return requireCapability(permission);
}

// Read-side variant for pages deciding what to render — role only, no
// plan or lock state. Prefer getCapabilities() for anything new.
export async function getMyPermissions() {
  const session = await requireSession();
  const granted = {} as Record<Permission, boolean>;
  for (const key of Object.keys(PERMISSIONS) as Permission[]) granted[key] = can(session.role, key);
  return { role: session.role, ...granted };
}
