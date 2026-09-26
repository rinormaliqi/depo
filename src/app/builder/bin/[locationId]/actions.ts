"use server";

import { and, desc, eq, gt, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import { items, locations, movements, stock } from "@/db/schema";
import { locationLabel } from "@/lib/location-path";
import { requirePermission } from "@/lib/permissions";
import { requireSession } from "@/lib/session";
import { exitStockAt, moveStockAt, receiveStockAt, requireOwnedBin } from "@/lib/stock";
import { attempt } from "@/lib/action-result";
import { UserError } from "@/lib/user-error";

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

// The other bins this one could send stock to — a plain code list for the
// destination field's datalist, not full rows: the picker only ever needs
// what the worker types against.
export async function getOtherBinCodes(locationId: string) {
  const { organizationId } = await requireSession();
  const bin = await requireOwnedBin(locationId, organizationId);

  const rows = await db
    .select({ code: locations.code })
    .from(locations)
    .where(and(eq(locations.facilityId, bin.facilityId), eq(locations.isBin, true)));
  return rows.map((r) => r.code).filter((code): code is string => Boolean(code) && code !== bin.code);
}

export async function getBinHistory(locationId: string) {
  const { organizationId } = await requireSession();
  const bin = await requireOwnedBin(locationId, organizationId);

  const allLocations = await db.select().from(locations).where(eq(locations.facilityId, bin.facilityId));
  const byId = new Map(allLocations.map((l) => [l.id, l]));

  const rows = await db
    .select({
      id: movements.id,
      createdAt: movements.createdAt,
      reason: movements.reason,
      quantity: movements.quantity,
      itemName: items.name,
      fromLocationId: movements.fromLocationId,
      toLocationId: movements.toLocationId,
    })
    .from(movements)
    .innerJoin(items, eq(movements.itemId, items.id))
    .where(
      and(
        eq(movements.organizationId, organizationId),
        or(eq(movements.fromLocationId, locationId), eq(movements.toLocationId, locationId)),
      ),
    )
    .orderBy(desc(movements.createdAt))
    .limit(20);

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
    from: locationLabel(m.fromLocationId, byId),
    to: locationLabel(m.toLocationId, byId),
  }));
}

async function receiveStockImpl(locationId: string, itemId: string, quantity: number) {
  const { userId, organizationId } = await requirePermission("moveStock");
  await receiveStockAt(organizationId, userId, locationId, itemId, quantity);
  revalidatePath(`/builder/bin/${locationId}`);
}

// Moves stock straight to another bin the worker names by code — resolved
// against the same facility as the source bin, exactly like the scanner's
// destination field.
async function moveStockImpl(locationId: string, itemId: string, quantity: number, destinationCode: string) {
  const { userId, organizationId } = await requirePermission("moveStock");
  const t = await getTranslations("scanner");
  const bin = await requireOwnedBin(locationId, organizationId);

  const trimmedCode = destinationCode.trim().toUpperCase();
  if (!trimmedCode) throw new UserError(t("errorEnterDestination"));
  const [destination] = await db
    .select()
    .from(locations)
    .where(and(eq(locations.facilityId, bin.facilityId), eq(locations.code, trimmedCode)));
  if (!destination || !destination.isBin) {
    throw new UserError(t("errorLocationNotFound", { code: trimmedCode }));
  }

  await moveStockAt(organizationId, userId, locationId, destination.id, itemId, quantity);
  revalidatePath(`/builder/bin/${locationId}`);
  return { destinationCode: destination.code ?? trimmedCode };
}

async function exitStockImpl(locationId: string, itemId: string, quantity: number, reason: "sale" | "remove") {
  const { userId, organizationId } = await requirePermission("moveStock");
  await exitStockAt(organizationId, userId, locationId, itemId, quantity, reason);
  revalidatePath(`/builder/bin/${locationId}`);
}

export async function receiveStock(locationId: string, itemId: string, quantity: number) {
  return attempt(() => receiveStockImpl(locationId, itemId, quantity), "receiveStock");
}

export async function moveStock(locationId: string, itemId: string, quantity: number, destinationCode: string) {
  return attempt(() => moveStockImpl(locationId, itemId, quantity, destinationCode), "moveStock");
}

export async function exitStock(locationId: string, itemId: string, quantity: number, reason: "sale" | "remove") {
  return attempt(() => exitStockImpl(locationId, itemId, quantity, reason), "exitStock");
}
