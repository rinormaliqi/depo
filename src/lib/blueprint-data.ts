import { and, eq, gt, inArray } from "drizzle-orm";
import { db } from "@/db";
import { items, locations, stock } from "@/db/schema";
import { ensureLevels } from "@/lib/levels";
import { getUnderlayMeta } from "@/lib/underlay";

// The blueprint's read query, with no ownership check of its own: callers
// check first — getBlueprint() (src/app/builder/actions.ts) against the
// caller's session, the admin view-as (src/app/internal/view-as-actions.ts)
// against the platform-admin role.
//
// It lives here, not in a "use server" file, on purpose (#194): every
// export of such a file is a server action anyone with a session can POST
// to, so an unchecked helper there let any signed-in user read another
// company's floor and stock given the facility id.
export async function buildBlueprintData(facilityId: string) {
  const rows = await db.select().from(locations).where(eq(locations.facilityId, facilityId));
  const binIds = rows.filter((l) => l.isBin).map((l) => l.id);

  // Item breakdown per bin, not just "has stock" — the canvas shades a bin
  // by how full it is (relative to the fullest bin here, since bins have no
  // declared capacity) and shows what's in it on hover, so the schema
  // carries the same "what's actually there" a worker gets from the bin
  // page itself, without leaving the map.
  const stockRows = binIds.length
    ? await db
        .select({
          locationId: stock.locationId,
          quantity: stock.quantity,
          itemId: stock.itemId,
          itemName: items.name,
          unitOfMeasure: items.unitOfMeasure,
          minStockLevel: items.minStockLevel,
        })
        .from(stock)
        .innerJoin(items, eq(stock.itemId, items.id))
        .where(and(inArray(stock.locationId, binIds), gt(stock.quantity, 0)))
    : [];

  const binStockById = new Map<string, { totalQuantity: number; items: { itemId: string; name: string; quantity: number; unitOfMeasure: string; belowMinimum: boolean }[] }>();
  // "Low stock" is answered per item, across the whole facility, not per
  // bin — a bin only ever holds part of an item's total. A bin (and each
  // item row in its tooltip) is flagged if the item's facility-wide total
  // sits under its own minStockLevel (null = no threshold set = never
  // flagged) — needs a full pass over every row first, so it's computed
  // before the per-bin breakdown is built rather than during the same loop.
  const facilityTotalByItemId = new Map<string, number>();
  const minStockLevelByItemId = new Map<string, number>();
  for (const row of stockRows) {
    facilityTotalByItemId.set(row.itemId, (facilityTotalByItemId.get(row.itemId) ?? 0) + row.quantity);
    if (row.minStockLevel !== null) minStockLevelByItemId.set(row.itemId, row.minStockLevel);
  }
  const lowStockItemIds = new Set(
    Array.from(minStockLevelByItemId)
      .filter(([itemId, min]) => (facilityTotalByItemId.get(itemId) ?? 0) < min)
      .map(([itemId]) => itemId),
  );

  for (const row of stockRows) {
    const entry = binStockById.get(row.locationId) ?? { totalQuantity: 0, items: [] };
    entry.totalQuantity += row.quantity;
    entry.items.push({ itemId: row.itemId, name: row.itemName, quantity: row.quantity, unitOfMeasure: row.unitOfMeasure, belowMinimum: lowStockItemIds.has(row.itemId) });
    binStockById.set(row.locationId, entry);
  }
  const binStock = Array.from(binStockById, ([locationId, v]) => ({ locationId, ...v }));
  const lowStockBinIds = [...new Set(stockRows.filter((r) => lowStockItemIds.has(r.itemId)).map((r) => r.locationId))];

  const levels = await ensureLevels(facilityId);
  const underlay = await getUnderlayMeta(facilityId);
  return { locations: rows, occupiedBinIds: binStock.map((b) => b.locationId), binStock, lowStockBinIds, levels, underlay };
}

