import { and, eq, gt, isNull } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import { facilities, invites, locations, memberships, organizations, plans, type MembershipRole } from "@/db/schema";
import { PERMISSIONS, type Permission } from "@/lib/permissions";
import { getMySession, getOrgLockReason, type OrgLockReason } from "@/lib/session";
import { UserError } from "@/lib/user-error";

// One answer to "can this user do X here?" — role × plan × org state ×
// usage, resolved once per request and read the same way by server
// actions (`requireCapability()`) and by the UI (`useCapabilities()` / `<Gate>`).
// Role permissions stay in src/lib/permissions.ts (the table of who may
// do what); plan entitlements and limits are data on the `plans` row;
// this module combines them and says *why* when the answer is no, so a
// blocked click and a blocked action show the same toast.
//
// Capabilities come in two kinds:
// - actions (the role permissions): moveStock, editLayout, manageItems,
//   manageTeam, manageBilling — also off while the org is locked
//   (unverified / trial ended / expired / past due / canceled).
// - features (plan-gated): printLabels, cameraScanning, viewMetrics,
//   multiFacility — a feature the plan doesn't include is off for every
//   role; reading is still allowed on a locked org.
// Limits (users, facilities, bins, history months) are numbers, checked
// with `requireRoom()` before something is added.

export const FEATURES = ["printLabels", "cameraScanning", "viewMetrics", "multiFacility"] as const;
export type Feature = (typeof FEATURES)[number];
export type Capability = Permission | Feature;
export const CAPABILITIES = [...(Object.keys(PERMISSIONS) as Permission[]), ...FEATURES] as const;

// Which roles a feature is for, on top of the plan including it.
const FEATURE_ROLES: Record<Feature, readonly MembershipRole[]> = {
  printLabels: ["admin", "manager", "worker"],
  cameraScanning: ["admin", "manager", "worker"],
  // Reporting is the manager's job; a worker's nav never shows it and the
  // URL shouldn't either.
  viewMetrics: ["admin", "manager"],
  multiFacility: ["admin", "manager"],
};

export type LimitKey = "users" | "facilities" | "bins";
export type Limit = { used: number; max: number | null };
export type BlockReason = { kind: "role" } | { kind: "plan" } | { kind: "locked"; lock: NonNullable<OrgLockReason> };

export type Capabilities = {
  organizationId: string;
  role: MembershipRole;
  plan: { key: string; name: string };
  locked: OrgLockReason;
  can: Record<Capability, boolean>;
  reason: Partial<Record<Capability, BlockReason>>;
  limits: Record<LimitKey, Limit> & { historyMonths: number | null };
};

export type PlanEntitlements = {
  key: string;
  name: string;
  features: Record<string, boolean>;
  maxUsers: number | null;
  maxFacilities: number | null;
  maxBins: number | null;
  movementHistoryMonths: number | null;
};

// Pure — the table-driven tests run this directly.
export function resolveCapabilities(input: {
  organizationId?: string;
  role: MembershipRole;
  plan: PlanEntitlements;
  locked: OrgLockReason;
  usage: Record<LimitKey, number>;
}): Capabilities {
  const { role, plan, locked, usage } = input;
  const can = {} as Record<Capability, boolean>;
  const reason: Partial<Record<Capability, BlockReason>> = {};

  for (const permission of Object.keys(PERMISSIONS) as Permission[]) {
    if (!(PERMISSIONS[permission] as readonly MembershipRole[]).includes(role)) {
      can[permission] = false;
      reason[permission] = { kind: "role" };
    } else if (locked) {
      can[permission] = false;
      reason[permission] = { kind: "locked", lock: locked };
    } else {
      can[permission] = true;
    }
  }

  // An empty feature map is a plan row nobody has configured yet (the
  // column's default) — that means "everything included", the way every
  // plan shipped before features existed. A non-empty map is authoritative:
  // a missing key there means "not included". This is what keeps a missed
  // backfill from switching the product off for every customer.
  const configured = Object.keys(plan.features ?? {}).length > 0;
  for (const feature of FEATURES) {
    // multiFacility is implied by the facilities limit rather than a flag:
    // a plan that allows more than one facility has the feature.
    const included =
      feature === "multiFacility"
        ? plan.maxFacilities === null || plan.maxFacilities > 1
        : !configured || plan.features[feature] === true;
    if (!FEATURE_ROLES[feature].includes(role)) {
      can[feature] = false;
      reason[feature] = { kind: "role" };
    } else if (!included) {
      can[feature] = false;
      reason[feature] = { kind: "plan" };
    } else {
      can[feature] = true;
    }
  }

  return {
    organizationId: input.organizationId ?? "",
    role,
    plan: { key: plan.key, name: plan.name },
    locked,
    can,
    reason,
    limits: {
      users: { used: usage.users, max: plan.maxUsers },
      facilities: { used: usage.facilities, max: plan.maxFacilities },
      bins: { used: usage.bins, max: plan.maxBins },
      historyMonths: plan.movementHistoryMonths,
    },
  };
}

// Counts pending (unexpired, unaccepted) invites as seats already spoken
// for, not just accepted memberships — otherwise an org could invite far
// more people than its plan allows and only find out once some try to accept.
export async function loadUsage(organizationId: string): Promise<Record<LimitKey, number>> {
  const [members, pending, facilityRows, binRows] = await Promise.all([
    db.select({ id: memberships.id }).from(memberships).where(eq(memberships.organizationId, organizationId)),
    db
      .select({ id: invites.id })
      .from(invites)
      .where(and(eq(invites.organizationId, organizationId), isNull(invites.acceptedAt), gt(invites.expiresAt, new Date()))),
    db.select({ id: facilities.id }).from(facilities).where(eq(facilities.organizationId, organizationId)),
    db
      .select({ id: locations.id })
      .from(locations)
      .innerJoin(facilities, eq(locations.facilityId, facilities.id))
      .where(and(eq(facilities.organizationId, organizationId), eq(locations.isBin, true))),
  ]);
  return { users: members.length + pending.length, facilities: facilityRows.length, bins: binRows.length };
}

async function loadPlan(organizationId: string): Promise<PlanEntitlements> {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId));
  const [plan] = await db.select().from(plans).where(eq(plans.id, org.planId));
  return plan;
}

export async function getCapabilitiesFor(organizationId: string, role: MembershipRole): Promise<Capabilities> {
  const [plan, locked, usage] = await Promise.all([loadPlan(organizationId), getOrgLockReason(organizationId), loadUsage(organizationId)]);
  return resolveCapabilities({ organizationId, role, plan, locked, usage });
}

// For pages: null when there's no session or no organization yet.
export async function getCapabilities(): Promise<Capabilities | null> {
  const session = await getMySession();
  if (!session) return null;
  return getCapabilitiesFor(session.organizationId, session.role);
}

export async function blockMessage(reason: BlockReason, capability: Capability): Promise<string> {
  if (reason.kind === "locked") return (await getTranslations("orgLocked"))(reason.lock);
  if (reason.kind === "role") return (await getTranslations("permission"))(capability);
  return (await getTranslations("capability.plan"))(capability);
}

// The write-path gate for server actions: session + capability, or a
// translated UserError the client shows as a toast. Returns the session.
export async function requireCapability(capability: Capability) {
  const session = await getMySession();
  if (!session) throw new Error("Not authenticated or no organization membership");
  const caps = await getCapabilitiesFor(session.organizationId, session.role);
  if (!caps.can[capability]) throw new UserError(await blockMessage(caps.reason[capability]!, capability));
  return session;
}

// "usage + what's about to be added must fit" — one query, so a single
// action that would itself blow past the limit (a template with more bins
// than the plan allows) is caught up front, not bin-by-bin halfway through.
export async function requireRoom(organizationId: string, limit: LimitKey, additional: number) {
  if (additional <= 0) return;
  const plan = await loadPlan(organizationId);
  const max = limit === "users" ? plan.maxUsers : limit === "facilities" ? plan.maxFacilities : plan.maxBins;
  if (max == null) return;
  const usage = await loadUsage(organizationId);
  if (usage[limit] + additional > max) {
    const t = await getTranslations("planLimit");
    throw new UserError(t(limit, { max }));
  }
}
