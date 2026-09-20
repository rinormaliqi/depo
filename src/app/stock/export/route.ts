import { and, asc, eq, gt } from "drizzle-orm";
import { getMyFacility } from "@/app/builder/actions";
import { db } from "@/db";
import { items, locations, stock } from "@/db/schema";
import { csvResponse, fileDate, fileSlug, toCsv } from "@/lib/csv";
import { getMySession } from "@/lib/session";

// What's on this facility's floor right now, one line per item × bin
// with stock: item (the SKU, or the name when there is none — what the
// stock import takes back), a readable name, the bin code, the
// quantity. Every role: it's the same view /stock gives.
export async function GET() {
  const session = await getMySession();
  if (!session) return new Response("Forbidden", { status: 403 });
  const facility = await getMyFacility();
  if (!facility) return new Response("No facility", { status: 404 });

  const rows = await db
    .select({ name: items.name, sku: items.sku, unit: items.unitOfMeasure, code: locations.code, quantity: stock.quantity })
    .from(stock)
    .innerJoin(locations, eq(stock.locationId, locations.id))
    .innerJoin(items, eq(stock.itemId, items.id))
    .where(and(eq(locations.facilityId, facility.id), eq(items.organizationId, session.organizationId), gt(stock.quantity, 0)))
    .orderBy(asc(locations.code), asc(items.name));

  const csv = toCsv([
    ["item", "name", "location", "quantity", "unit"],
    ...rows.map((r) => [r.sku ?? r.name, r.name, r.code, r.quantity, r.unit]),
  ]);
  return csvResponse(csv, `stoku-${fileSlug(facility.name)}-${fileDate()}.csv`);
}
