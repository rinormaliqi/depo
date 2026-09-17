"use server";

import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { getMyFacility } from "@/app/builder/actions";
import { getZoneUtilization } from "@/app/stock/actions";
import { db } from "@/db";
import { items, locations, movements, stock, users } from "@/db/schema";
import { locationLabel } from "@/lib/location-path";
import { requireOrgId } from "@/lib/session";

function formatWhen(d: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

export async function getMetrics() {
  const organizationId = await requireOrgId();
  const facility = await getMyFacility();
  if (!facility) return null;

  const allLocations = await db
    .select()
    .from(locations)
    .where(eq(locations.facilityId, facility.id));
  const byId = new Map(allLocations.map((l) => [l.id, l]));
  const bins = allLocations.filter((l) => l.isBin);
  const binIds = bins.map((l) => l.id);
  const zones = allLocations.filter((l) => l.kind === "zone");

  const stockRows = binIds.length
    ? await db
        .select({ itemId: stock.itemId, locationId: stock.locationId, quantity: stock.quantity })
        .from(stock)
        .where(inArray(stock.locationId, binIds))
    : [];
  const occupied = new Set(stockRows.filter((r) => r.quantity > 0).map((r) => r.locationId));
  const accountedSkus = new Set(stockRows.filter((r) => r.quantity > 0).map((r) => r.itemId));
  const mappedArea = zones.reduce((a, z) => a + z.widthM * z.heightM, 0);

  const kpis = {
    mappedAreaM2: Math.round(mappedArea),
    zoneCount: zones.length,
    liveLocations: bins.length,
    occPct: bins.length ? Math.round((occupied.size / bins.length) * 100) : 0,
    accountedSkus: accountedSkus.size,
  };

  const logRows = await db
    .select({
      id: movements.id,
      createdAt: movements.createdAt,
      reason: movements.reason,
      quantity: movements.quantity,
      itemName: items.name,
      fromLocationId: movements.fromLocationId,
      toLocationId: movements.toLocationId,
      performedByName: users.name,
    })
    .from(movements)
    .innerJoin(items, eq(movements.itemId, items.id))
    .innerJoin(users, eq(movements.performedBy, users.id))
    // Metrics are per facility (the stats above are computed from this
    // facility's bins), so the log is too — a movement touches this floor
    // if either end of it is one of its locations.
    .where(
      and(
        eq(movements.organizationId, organizationId),
        binIds.length > 0
          ? or(inArray(movements.toLocationId, binIds), inArray(movements.fromLocationId, binIds))
          : sql`false`,
      ),
    )
    .orderBy(desc(movements.createdAt))
    .limit(30);

  const log = logRows.map((m) => ({
    id: m.id,
    when: formatWhen(m.createdAt),
    who: m.performedByName,
    reason: m.reason,
    itemName: m.itemName,
    quantity: m.quantity,
    from: locationLabel(m.fromLocationId, byId),
    to: locationLabel(m.toLocationId, byId),
  }));

  const zoneRows = await getZoneUtilization();

  return { kpis, zoneRows, log };
}
