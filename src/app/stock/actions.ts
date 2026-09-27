"use server";

import { and, eq, gt, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { getMyFacility } from "@/app/builder/actions";
import { db } from "@/db";
import { facilities, items, itemCustomFieldDefinitions, itemCustomFieldValues, locations, stock } from "@/db/schema";
import { locationLabel } from "@/lib/location-path";
import { requireOrgId } from "@/lib/session";

export type StockFieldFilter = { fieldId: string; value: string };

export async function searchStock(query: string, filter?: StockFieldFilter) {
  const organizationId = await requireOrgId();
  const q = query.trim();
  const filterValue = (filter?.value ?? "").trim();
  // A field picked with no value yet isn't a filter someone can act on —
  // same as typing nothing into the text box, it's "not searching yet",
  // not "show nothing".
  if (!q && !filter?.fieldId) return [];

  const conditions: SQL[] = [eq(items.organizationId, organizationId), gt(stock.quantity, 0)];
  if (q) conditions.push(or(ilike(items.name, `%${q}%`), ilike(items.sku, `%${q}%`))!);

  if (filter?.fieldId) {
    const [field] = await db
      .select({ type: itemCustomFieldDefinitions.type })
      .from(itemCustomFieldDefinitions)
      .where(and(eq(itemCustomFieldDefinitions.id, filter.fieldId), eq(itemCustomFieldDefinitions.organizationId, organizationId)));
    if (field && !filterValue) {
      // A field picked with nothing to match against yet narrows to zero
      // rather than either showing every item that merely has some value
      // for it, or — worse — falling through to every current stock row
      // unfiltered. The search box's job is to narrow down, not dump the
      // catalog the moment a field is picked.
      conditions.push(sql`false`);
    } else if (field) {
      // select/boolean values are exact choices — a substring match on
      // "Red" would also catch "Redwood" if that were ever an option.
      const exactMatch = field.type === "select" || field.type === "boolean";
      const valueMatch = exactMatch ? eq(itemCustomFieldValues.value, filterValue) : ilike(itemCustomFieldValues.value, `%${filterValue}%`);
      const matchingItemIds = db
        .select({ id: itemCustomFieldValues.itemId })
        .from(itemCustomFieldValues)
        .where(and(eq(itemCustomFieldValues.fieldDefinitionId, filter.fieldId), valueMatch));
      conditions.push(inArray(items.id, matchingItemIds));
    }
  }

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
    .where(and(...conditions))
    .limit(30);

  if (rows.length === 0) return [];

  // Items are org-wide, so a hit can sit in any of the org's facilities:
  // resolve paths against all of them and name the facility when it isn't
  // the one the user is currently in — "where is X" shouldn't stop at the
  // site you happen to have open.
  const [current, orgLocations] = await Promise.all([
    getMyFacility(),
    db
      .select({ location: locations, facilityName: facilities.name })
      .from(locations)
      .innerJoin(facilities, eq(locations.facilityId, facilities.id))
      .where(eq(facilities.organizationId, organizationId)),
  ]);
  const byId = new Map(orgLocations.map(({ location }) => [location.id, location]));
  const facilityNameByLocation = new Map(orgLocations.map(({ location, facilityName }) => [location.id, facilityName]));

  return rows.map((r) => {
    const loc = byId.get(r.locationId);
    const elsewhere = loc && current && loc.facilityId !== current.id ? facilityNameByLocation.get(r.locationId) : null;
    const path = locationLabel(r.locationId, byId);
    return {
      itemName: r.itemName,
      sku: r.sku,
      unitOfMeasure: r.unitOfMeasure,
      quantity: r.quantity,
      locationId: r.locationId,
      path: elsewhere ? `${elsewhere} › ${path}` : path,
    };
  });
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
