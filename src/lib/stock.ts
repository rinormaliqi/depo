import { and, eq, sql } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import { facilities, items, locations, movements, stock } from "@/db/schema";
import { getOrgLockReason } from "@/lib/session";
import { UserError } from "@/lib/user-error";

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
  if (!Number.isInteger(quantity) || quantity <= 0) {
    const t = await getTranslations("stockError");
    throw new UserError(t("quantity"));
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

export async function pickStockAt(
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

  const [existing] = await db
    .select()
    .from(stock)
    .where(and(eq(stock.itemId, itemId), eq(stock.locationId, locationId)));
  if (!existing || existing.quantity < quantity) {
    const t = await getTranslations("stockError");
    throw new UserError(t("notEnough"));
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
