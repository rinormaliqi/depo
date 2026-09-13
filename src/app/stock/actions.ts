"use server";

import { and, eq, gt, ilike, inArray, or } from "drizzle-orm";
import { getMyFacility } from "@/app/builder/actions";
import { db } from "@/db";
import { items, locations, stock } from "@/db/schema";
import { locationLabel } from "@/lib/location-path";
import { requireOrgId } from "@/lib/session";

export async function searchStock(query: string) {
  const organizationId = await requireOrgId();
  const q = query.trim();
  if (!q) return [];

  const rows = await db
    .select({
      itemName: items.name,
      sku: items.sku,
      unitOfMeasure: items.unitOfMeasure,
      locationId: stock.locationId,
      quantity: stock.quantity,
    })
    .from(stock)
    .innerJoin(items, eq(stock.itemId, items.id))
    .where(
      and(
        eq(items.organizationId, organizationId),
        gt(stock.quantity, 0),
        or(ilike(items.name, `%${q}%`), ilike(items.sku, `%${q}%`)),
      ),
    )
    .limit(30);

  if (rows.length === 0) return [];

  const facility = await getMyFacility();
  const allLocations = facility
    ? await db.select().from(locations).where(eq(locations.facilityId, facility.id))
    : [];
  const byId = new Map(allLocations.map((l) => [l.id, l]));

  return rows.map((r) => ({
    itemName: r.itemName,
    sku: r.sku,
    unitOfMeasure: r.unitOfMeasure,
    quantity: r.quantity,
    locationId: r.locationId,
    path: locationLabel(r.locationId, byId),
  }));
}

export async function getZoneUtilization() {
  const facility = await getMyFacility();
  if (!facility) return [];

  const allLocations = await db
    .select()
    .from(locations)
    .where(eq(locations.facilityId, facility.id));
  const binIds = allLocations.filter((l) => l.isBin).map((l) => l.id);
  const stockRows = binIds.length
    ? await db
        .select({ locationId: stock.locationId, quantity: stock.quantity })
        .from(stock)
        .where(inArray(stock.locationId, binIds))
    : [];
  const occupiedIds = new Set(stockRows.filter((r) => r.quantity > 0).map((r) => r.locationId));

  return allLocations
    .filter((l) => l.kind === "zone")
    .map((zone) => {
      const direct = allLocations.filter((l) => l.parentId === zone.id);
      const directIds = new Set(direct.map((d) => d.id));
      const grandkids = allLocations.filter((l) => l.parentId && directIds.has(l.parentId));
      const bins = [...direct, ...grandkids].filter((l) => l.isBin);
      const occupied = bins.filter((b) => occupiedIds.has(b.id)).length;
      return {
        id: zone.id,
        code: zone.code ?? zone.name,
        name: zone.name,
        totalBins: bins.length,
        occupied,
        occPct: bins.length ? Math.round((occupied / bins.length) * 100) : 0,
        areaM2: Math.round(zone.widthM * zone.heightM),
      };
    });
}
