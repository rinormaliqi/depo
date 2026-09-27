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

  // Live stock only ever answers "what's on the floor right now" — it can't
  // tell a quiet warehouse from one that moved a thousand units and sold
  // them all. These come from the append-only movements log instead, so
  // "in the warehouse" (accountedSkus/occPct above), "moved", "sold" and
  // "removed" are each answered from the source that actually knows it.
  const [exitTotals] = binIds.length
    ? await db
        .select({
          soldUnits: sql<number>`coalesce(sum(case when ${movements.reason} = 'sale' then ${movements.quantity} else 0 end), 0)::int`,
          removedUnits: sql<number>`coalesce(sum(case when ${movements.reason} = 'remove' then ${movements.quantity} else 0 end), 0)::int`,
          relocatedUnits: sql<number>`coalesce(sum(case when ${movements.reason} = 'relocate' then ${movements.quantity} else 0 end), 0)::int`,
        })
        .from(movements)
        .where(
          and(
            eq(movements.organizationId, organizationId),
            or(inArray(movements.fromLocationId, binIds), inArray(movements.toLocationId, binIds)),
          ),
        )
    : [{ soldUnits: 0, removedUnits: 0, relocatedUnits: 0 }];

  const kpis = {
    mappedAreaM2: Math.round(mappedArea),
    zoneCount: zones.length,
    liveLocations: bins.length,
    occPct: bins.length ? Math.round((occupied.size / bins.length) * 100) : 0,
    accountedSkus: accountedSkus.size,
    soldUnits: exitTotals.soldUnits,
    removedUnits: exitTotals.removedUnits,
    relocatedUnits: exitTotals.relocatedUnits,
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
