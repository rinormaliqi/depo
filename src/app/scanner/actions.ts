"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getMyFacility } from "@/app/builder/actions";
import { db } from "@/db";
import { items, locations, movements } from "@/db/schema";
import { locationLabel } from "@/lib/location-path";
import { requireSession } from "@/lib/session";
import { receiveStockAt } from "@/lib/stock";

export async function commitScan(itemId: string, quantity: number, code: string) {
  const { userId, organizationId } = await requireSession();
  const facility = await getMyFacility();
  if (!facility) throw new Error("No facility found");

  const trimmedCode = code.trim().toUpperCase();
  if (!trimmedCode) throw new Error("Enter a location, e.g. A-01-3");

  const [location] = await db
    .select()
    .from(locations)
    .where(and(eq(locations.facilityId, facility.id), eq(locations.code, trimmedCode)));
  if (!location || !location.isBin) {
    throw new Error(`${trimmedCode} is not a location on this floor`);
  }

  await receiveStockAt(organizationId, userId, location.id, itemId, quantity);
  revalidatePath("/scanner");
  return { locationLabel: trimmedCode };
}

export async function getRecentMovements() {
  const { organizationId } = await requireSession();
  const facility = await getMyFacility();

  const rows = await db
    .select({
      id: movements.id,
      createdAt: movements.createdAt,
      reason: movements.reason,
      quantity: movements.quantity,
      itemName: items.name,
      toLocationId: movements.toLocationId,
    })
    .from(movements)
    .innerJoin(items, eq(movements.itemId, items.id))
    .where(eq(movements.organizationId, organizationId))
    .orderBy(desc(movements.createdAt))
    .limit(10);

  const allLocations = facility
    ? await db.select().from(locations).where(eq(locations.facilityId, facility.id))
    : [];
  const byId = new Map(allLocations.map((l) => [l.id, l]));

  return rows.map((m) => ({
    id: m.id,
    when: new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(m.createdAt),
    reason: m.reason,
    itemName: m.itemName,
    quantity: m.quantity,
    to: locationLabel(m.toLocationId, byId),
  }));
}
