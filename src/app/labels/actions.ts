"use server";

import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { getFacilityLocations, getMyFacility } from "@/app/builder/actions";
import { db } from "@/db";
import { facilities, locations } from "@/db/schema";
import { locationLabel } from "@/lib/location-path";
import { requireCapability } from "@/lib/capabilities";
import { requireOwnedBin } from "@/lib/stock";
import { UserError } from "@/lib/user-error";

export type LabelBin = { id: string; code: string; path: string };
/** A zone of the facility and how many labels printing it gives. */
export type LabelGroup = { id: string; label: string; count: number };

export type LabelScope =
  | { kind: "facility" }
  | { kind: "parent"; parentId: string }
  | { kind: "bin"; binId: string };

// Bins are the only locations that get a label — a rack or zone is
// something you walk to, a bin is something you put stock in. "parent"
// prints every bin nested anywhere under one location (a rack, or a
// whole zone), which is how labels are actually applied on the floor:
// one rack at a time, not the whole building in one go.
export async function getLabelBins(
  scope: LabelScope,
): Promise<{ facilityId: string; facilityName: string; title: string; bins: LabelBin[]; zones: LabelGroup[] }> {
  const { organizationId } = await requireCapability("printLabels");
  const t = await getTranslations("labels");

  let facilityId: string;
  let root: string | null = null;
  if (scope.kind === "bin") {
    facilityId = (await requireOwnedBin(scope.binId, organizationId)).facilityId;
    root = scope.binId;
  } else if (scope.kind === "parent") {
    const [parent] = await db.select().from(locations).where(eq(locations.id, scope.parentId));
    if (!parent) throw new UserError(t("errorNotFound"));
    facilityId = parent.facilityId;
    root = parent.id;
  } else {
    const facility = await getMyFacility();
    if (!facility) throw new UserError(t("errorNotFound"));
    facilityId = facility.id;
  }

  // getFacilityLocations is the ownership check for the "parent" case —
  // it throws unless the facility belongs to this org.
  const all = await getFacilityLocations(facilityId);
  const byId = new Map(all.map((l) => [l.id, l]));
  const [facilityRow] = await db.select().from(facilities).where(eq(facilities.id, facilityId));

  const inScope = (id: string): boolean => {
    if (!root) return true;
    let cur = byId.get(id) ?? null;
    while (cur) {
      if (cur.id === root) return true;
      cur = cur.parentId ? (byId.get(cur.parentId) ?? null) : null;
    }
    return false;
  };

  const bins = all
    .filter((l) => l.isBin && l.code && inScope(l.id))
    .map((l) => ({ id: l.id, code: l.code as string, path: locationLabel(l.parentId, byId) }))
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));

  // For the whole facility: each zone with its bin count, so a big floor
  // can be printed one zone at a time (#207). A bin counts for the nearest
  // zone above it; bins outside any zone are simply not offered here.
  const zoneCounts = new Map<string, number>();
  if (scope.kind === "facility") {
    for (const b of bins) {
      let cur = byId.get(b.id) ?? null;
      while (cur && cur.kind !== "zone") cur = cur.parentId ? (byId.get(cur.parentId) ?? null) : null;
      if (cur) zoneCounts.set(cur.id, (zoneCounts.get(cur.id) ?? 0) + 1);
    }
  }
  const zones = [...zoneCounts.entries()]
    .map(([id, count]) => {
      const z = byId.get(id)!;
      return { id, label: z.code ? `${z.code} · ${z.name}` : z.name, count };
    })
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));

  const rootRow = root ? byId.get(root) : null;
  return {
    facilityId,
    facilityName: facilityRow?.name ?? "",
    title: rootRow ? (rootRow.code ?? rootRow.name) : (facilityRow?.name ?? ""),
    bins,
    zones,
  };
}
