"use server";

import { and, desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getMyFacility } from "@/app/builder/actions";
import { db } from "@/db";
import { items, locations, movements } from "@/db/schema";
import { locationLabel } from "@/lib/location-path";
import { requirePermission } from "@/lib/permissions";
import { requireSession } from "@/lib/session";
import { receiveStockAt } from "@/lib/stock";
import { attempt } from "@/lib/action-result";
import { UserError } from "@/lib/user-error";

async function commitScanImpl(itemId: string, quantity: number, code: string) {
  const { userId, organizationId } = await requirePermission("moveStock");
  const t = await getTranslations("scanner");
  const facility = await getMyFacility();
  if (!facility) throw new UserError(t("errorNoFacility"));

  const trimmedCode = code.trim().toUpperCase();
  if (!trimmedCode) throw new UserError(t("errorEnterLocation"));

  const [location] = await db
    .select()
    .from(locations)
    .where(and(eq(locations.facilityId, facility.id), eq(locations.code, trimmedCode)));
  if (!location || !location.isBin) {
    throw new UserError(t("errorLocationNotFound", { code: trimmedCode }));
  }

  await receiveStockAt(organizationId, userId, location.id, itemId, quantity);
  revalidatePath("/scanner");
  return { locationLabel: trimmedCode };
}

export async function getRecentMovements() {
  const { organizationId } = await requireSession();
  const facility = await getMyFacility();

  // Scoped to the facility the user is in: the scanner page is "what just
  // happened on this floor", and the labels are resolved against this
  // facility's locations anyway.
  const allLocations = facility
    ? await db.select().from(locations).where(eq(locations.facilityId, facility.id))
    : [];
  const byId = new Map(allLocations.map((l) => [l.id, l]));
  const locationIds = allLocations.map((l) => l.id);
  if (locationIds.length === 0) return [];

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
    .where(and(eq(movements.organizationId, organizationId), inArray(movements.toLocationId, locationIds)))
    .orderBy(desc(movements.createdAt))
    .limit(10);

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

export async function commitScan(itemId: string, quantity: number, code: string) {
  return attempt(() => commitScanImpl(itemId, quantity, code), "commitScan");
}
