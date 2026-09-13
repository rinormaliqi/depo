import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { facilities, items, locations, movements, stock } from "@/db/schema";

// Shared by both the bin detail page and the Scanner — not itself a server
// action, just the core receive/pick logic called from ones that are.

export async function requireOwnedBin(locationId: string, organizationId: string) {
  const [location] = await db.select().from(locations).where(eq(locations.id, locationId));
  if (!location || !location.isBin) {
    throw new Error("Bin not found");
  }

  const [facility] = await db
    .select()
    .from(facilities)
    .where(eq(facilities.id, location.facilityId));
  if (!facility || facility.organizationId !== organizationId) {
    throw new Error("Bin not found");
  }

  return location;
}

export async function requireOwnedItem(itemId: string, organizationId: string) {
  const [item] = await db.select().from(items).where(eq(items.id, itemId));
  if (!item || item.organizationId !== organizationId) {
    throw new Error("Item not found");
  }
  return item;
}

function requirePositiveQuantity(quantity: number) {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error("Quantity must be a positive whole number");
  }
}

export async function receiveStockAt(
  organizationId: string,
  userId: string,
  locationId: string,
  itemId: string,
  quantity: number,
) {
  await requireOwnedBin(locationId, organizationId);
  await requireOwnedItem(itemId, organizationId);
  requirePositiveQuantity(quantity);

  await db.insert(movements).values({
    organizationId,
    itemId,
    fromLocationId: null,
    toLocationId: locationId,
    quantity,
    reason: "receive",
    performedBy: userId,
  });

  await db
    .insert(stock)
    .values({ itemId, locationId, quantity })
    .onConflictDoUpdate({
      target: [stock.itemId, stock.locationId],
      set: { quantity: sql`${stock.quantity} + ${quantity}`, updatedAt: new Date() },
    });
}

export async function pickStockAt(
  organizationId: string,
  userId: string,
  locationId: string,
  itemId: string,
  quantity: number,
) {
  await requireOwnedBin(locationId, organizationId);
  await requireOwnedItem(itemId, organizationId);
  requirePositiveQuantity(quantity);

  const [existing] = await db
    .select()
    .from(stock)
    .where(and(eq(stock.itemId, itemId), eq(stock.locationId, locationId)));
  if (!existing || existing.quantity < quantity) {
    throw new Error("Not enough stock in this bin");
  }

  await db.insert(movements).values({
    organizationId,
    itemId,
    fromLocationId: locationId,
    toLocationId: null,
    quantity,
    reason: "pick",
    performedBy: userId,
  });

  await db
    .update(stock)
    .set({ quantity: existing.quantity - quantity, updatedAt: new Date() })
    .where(and(eq(stock.itemId, itemId), eq(stock.locationId, locationId)));
}
