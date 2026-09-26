import { and, eq, sql } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import { facilities, items, locations, movements, stock } from "@/db/schema";
import { getOrgLockReason } from "@/lib/session";
import { UserError } from "@/lib/user-error";
import { MAX_MOVEMENT_QUANTITY } from "@/lib/stock-limits";

// Shared by both the bin detail page and the Scanner — not itself a server
// action, just the core receive/pick logic called from ones that are.

export async function requireOwnedBin(locationId: string, organizationId: string) {
  const [location] = await db.select().from(locations).where(eq(locations.id, locationId));
  const t = await getTranslations("stockError");
  if (!location || !location.isBin) {
    throw new UserError(t("binNotFound"));
  }

  const [facility] = await db
    .select()
    .from(facilities)
    .where(eq(facilities.id, location.facilityId));
  if (!facility || facility.organizationId !== organizationId) {
    throw new UserError(t("binNotFound"));
  }

  return location;
}

export async function requireOwnedItem(itemId: string, organizationId: string) {
  const [item] = await db.select().from(items).where(eq(items.id, itemId));
  if (!item || item.organizationId !== organizationId) {
    const t = await getTranslations("stockError");
    throw new UserError(t("itemNotFound"));
  }
  return item;
}

// receiveStockAt/pickStockAt already take organizationId from their caller,
// so this checks lock status directly rather than going through
// requireActiveOrg() (which would re-derive organizationId from the
// session — redundant when it's already in hand).
async function requireOrgNotLocked(organizationId: string) {
  const reason = await getOrgLockReason(organizationId);
  if (reason) {
    const t = await getTranslations("orgLocked");
    throw new UserError(t(reason));
  }
}

async function requirePositiveQuantity(quantity: number) {
  const t = await getTranslations("stockError");
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new UserError(t("quantity"));
  }
  if (quantity > MAX_MOVEMENT_QUANTITY) {
    throw new UserError(t("quantityTooLarge", { max: MAX_MOVEMENT_QUANTITY }));
  }
}

export async function receiveStockAt(
  organizationId: string,
  userId: string,
  locationId: string,
  itemId: string,
  quantity: number,
) {
  await requireOrgNotLocked(organizationId);
  await requireOwnedBin(locationId, organizationId);
  await requireOwnedItem(itemId, organizationId);
  await requirePositiveQuantity(quantity);

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

// Shared by pickStockAt and exitStockAt — they differ only in which reason
// lands in the history row (generic "pick" vs. a specific "sale"/"remove"),
// not in how the quantity check or the debit itself works.
async function deductStockAt(
  organizationId: string,
  userId: string,
  locationId: string,
  itemId: string,
  quantity: number,
  reason: "pick" | "sale" | "remove",
) {
  await requireOrgNotLocked(organizationId);
  await requireOwnedBin(locationId, organizationId);
  await requireOwnedItem(itemId, organizationId);
  await requirePositiveQuantity(quantity);
  const t = await getTranslations("stockError");

  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(stock)
      .where(and(eq(stock.itemId, itemId), eq(stock.locationId, locationId)));
    if (!existing || existing.quantity < quantity) {
      throw new UserError(t("notEnough"));
    }

    await tx.insert(movements).values({
      organizationId,
      itemId,
      fromLocationId: locationId,
      toLocationId: null,
      quantity,
      reason,
      performedBy: userId,
    });

    await tx
      .update(stock)
      .set({ quantity: existing.quantity - quantity, updatedAt: new Date() })
      .where(and(eq(stock.itemId, itemId), eq(stock.locationId, locationId)));
  });
}

export async function pickStockAt(
  organizationId: string,
  userId: string,
  locationId: string,
  itemId: string,
  quantity: number,
) {
  return deductStockAt(organizationId, userId, locationId, itemId, quantity, "pick");
}

// The item leaves the warehouse for good — sold, or scrapped/lost/otherwise
// removed. Unlike "pick" (a generic historical exit kept for back-compat),
// callers must say which, so history and metrics can tell a sale apart from
// a loss instead of lumping every exit together.
export async function exitStockAt(
  organizationId: string,
  userId: string,
  locationId: string,
  itemId: string,
  quantity: number,
  reason: "sale" | "remove",
) {
  return deductStockAt(organizationId, userId, locationId, itemId, quantity, reason);
}

// Moves quantity from one bin straight to another as a single "relocate"
// history row (both fromLocationId and toLocationId set), instead of a
// pick-then-receive pair that would read as two unrelated exits/entries.
export async function moveStockAt(
  organizationId: string,
  userId: string,
  fromLocationId: string,
  toLocationId: string,
  itemId: string,
  quantity: number,
) {
  await requireOrgNotLocked(organizationId);
  await requireOwnedBin(fromLocationId, organizationId);
  await requireOwnedBin(toLocationId, organizationId);
  await requireOwnedItem(itemId, organizationId);
  await requirePositiveQuantity(quantity);
  const t = await getTranslations("stockError");

  if (fromLocationId === toLocationId) {
    throw new UserError(t("sameLocation"));
  }

  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(stock)
      .where(and(eq(stock.itemId, itemId), eq(stock.locationId, fromLocationId)));
    if (!existing || existing.quantity < quantity) {
      throw new UserError(t("notEnough"));
    }

    await tx.insert(movements).values({
      organizationId,
      itemId,
      fromLocationId,
      toLocationId,
      quantity,
      reason: "relocate",
      performedBy: userId,
    });

    await tx
      .update(stock)
      .set({ quantity: existing.quantity - quantity, updatedAt: new Date() })
      .where(and(eq(stock.itemId, itemId), eq(stock.locationId, fromLocationId)));

    await tx
      .insert(stock)
      .values({ itemId, locationId: toLocationId, quantity })
      .onConflictDoUpdate({
        target: [stock.itemId, stock.locationId],
        set: { quantity: sql`${stock.quantity} + ${quantity}`, updatedAt: new Date() },
      });
  });
}
