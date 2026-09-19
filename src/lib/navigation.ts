import type { Capabilities } from "@/lib/capabilities";

// What the app's navigation shows, decided from capabilities — not from
// the role name, so a plan that drops a feature drops its tab too.
//
// Workers get the floor: find, scan, labels, and the map to look at.
// Managers run the depot: blueprint first, then stock, metrics, scanner,
// with items and team in the secondary row. Admins add billing.
export type NavItem = { key: string; href: string };

export function primaryNav(caps: Pick<Capabilities, "role" | "can">): NavItem[] {
  if (caps.role === "worker") {
    return [
      { key: "find", href: "/stock" },
      { key: "scanner", href: "/scanner" },
      ...(caps.can.printLabels ? [{ key: "labels", href: "/labels" }] : []),
      { key: "blueprint", href: "/builder" },
    ];
  }
  return [
    { key: "blueprint", href: "/builder" },
    { key: "stock", href: "/stock" },
    ...(caps.can.viewMetrics ? [{ key: "metrics", href: "/metrics" }] : []),
    { key: "scanner", href: "/scanner" },
  ];
}

export function secondaryNav(caps: Pick<Capabilities, "role" | "can">): NavItem[] {
  return [
    ...(caps.can.manageItems ? [{ key: "items", href: "/items" }] : []),
    ...(caps.can.manageTeam ? [{ key: "team", href: "/team" }] : []),
    ...(caps.can.manageBilling ? [{ key: "billing", href: "/billing" }] : []),
  ];
}

// Where a session lands after signing in: the worker's day starts at
// "find", everyone else's at the blueprint.
export function homeFor(role: Capabilities["role"]): string {
  return role === "worker" ? "/stock" : "/builder";
}
