"use server";

import { and, eq, gt } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { items, stock } from "@/db/schema";
import { requirePermission } from "@/lib/permissions";
import { requireSession } from "@/lib/session";
import { pickStockAt, receiveStockAt, requireOwnedBin } from "@/lib/stock";
import { attempt } from "@/lib/action-result";

export async function getBinInfo(locationId: string) {
  const { organizationId } = await requireSession();
  return requireOwnedBin(locationId, organizationId);
}

export async function getBinStock(locationId: string) {
  const { organizationId } = await requireSession();
  await requireOwnedBin(locationId, organizationId);

  return db
    .select({
      itemId: items.id,
      name: items.name,
      unitOfMeasure: items.unitOfMeasure,
      quantity: stock.quantity,
    })
    .from(stock)
    .innerJoin(items, eq(stock.itemId, items.id))
    .where(and(eq(stock.locationId, locationId), gt(stock.quantity, 0)))
    .orderBy(items.name);
}

async function receiveStockImpl(locationId: string, itemId: string, quantity: number) {
  const { userId, organizationId } = await requirePermission("moveStock");
  await receiveStockAt(organizationId, userId, locationId, itemId, quantity);
  revalidatePath(`/builder/bin/${locationId}`);
}

async function pickStockImpl(locationId: string, itemId: string, quantity: number) {
  const { userId, organizationId } = await requirePermission("moveStock");
  await pickStockAt(organizationId, userId, locationId, itemId, quantity);
  revalidatePath(`/builder/bin/${locationId}`);
}

export async function receiveStock(locationId: string, itemId: string, quantity: number) {
  return attempt(() => receiveStockImpl(locationId, itemId, quantity));
}

export async function pickStock(locationId: string, itemId: string, quantity: number) {
  return attempt(() => pickStockImpl(locationId, itemId, quantity));
}
