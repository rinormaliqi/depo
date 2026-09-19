"use server";

import { and, desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getMyFacility } from "@/app/builder/actions";
import { db } from "@/db";
import { facilities, items, locations, movements } from "@/db/schema";
import { locationLabel } from "@/lib/location-path";
import { requirePermission } from "@/lib/permissions";
import { requireSession } from "@/lib/session";
import { requireCapability } from "@/lib/capabilities";
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

// A printed label's QR carries the bin's URL (/builder/bin/<id>, see
// src/app/labels/page.tsx), not the code — so a decoded scan goes through
// here to become the code the form and commitScan work in. Anything that
// isn't one of our bin URLs (a code typed into some other QR, a product
// barcode) is passed back verbatim, uppercased, and commitScan's lookup
// decides whether it's a location on this floor.
const BIN_URL = /\/builder\/bin\/([0-9a-f-]{36})(?:[?#]|$)/i;

async function resolveScanImpl(raw: string): Promise<{ code: string }> {
  const { organizationId } = await requireCapability("cameraScanning");
  const t = await getTranslations("scanner");
  const match = raw.trim().match(BIN_URL);
  if (!match) return { code: raw.trim().toUpperCase() };

  const facility = await getMyFacility();
  const [location] = await db.select().from(locations).where(eq(locations.id, match[1]));
  if (!location || !location.isBin || !location.code) throw new UserError(t("errorScanUnknown"));
  // Same guard as the bin page: never reveal another org's codes. A bin
  // from one of *our* other facilities is a real situation (labels from
  // site B scanned at site A) and gets a specific message.
  const [owner] = await db.select().from(facilities).where(eq(facilities.id, location.facilityId));
  if (!owner || owner.organizationId !== organizationId) throw new UserError(t("errorScanUnknown"));
  if (!facility || facility.id !== location.facilityId) {
    throw new UserError(t("errorScanOtherFacility", { code: location.code, facility: owner.name }));
  }
  return { code: location.code };
}

export async function resolveScan(raw: string) {
  return attempt(() => resolveScanImpl(raw), "resolveScan");
}
