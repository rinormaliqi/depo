"use server";

import { and, eq, gt, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import { facilities, locations, stock, type LocationKind } from "@/db/schema";
import { bayCode, LOCATION_TYPES, nextCode, round2 } from "@/lib/blueprint-types";
import { getMyOrgId, requireOrgId } from "@/lib/session";

export type LocationRow = typeof locations.$inferSelect;

async function requireOwnedFacility(facilityId: string) {
  const organizationId = await requireOrgId();

  const [facility] = await db.select().from(facilities).where(eq(facilities.id, facilityId));
  if (!facility || facility.organizationId !== organizationId) {
    const t = await getTranslations("builder.error");
    throw new Error(t("facilityNotFound"));
  }

  return facility;
}

async function requireOwnedLocation(locationId: string) {
  const organizationId = await requireOrgId();
  const t = await getTranslations("builder.error");

  const [location] = await db.select().from(locations).where(eq(locations.id, locationId));
  if (!location) throw new Error(t("locationNotFound"));

  const [facility] = await db
    .select()
    .from(facilities)
    .where(eq(facilities.id, location.facilityId));
  if (!facility || facility.organizationId !== organizationId) {
    throw new Error(t("locationNotFound"));
  }

  return location;
}

// Assumes one facility per org for now — multi-facility switching isn't built yet.
export async function getMyFacility() {
  const organizationId = await getMyOrgId();
  if (!organizationId) return null;

  const [facility] = await db
    .select()
    .from(facilities)
    .where(eq(facilities.organizationId, organizationId))
    .limit(1);
  return facility ?? null;
}

export async function updateFacility(
  facilityId: string,
  patch: { name?: string; widthM?: number; heightM?: number },
) {
  await requireOwnedFacility(facilityId);

  const values: Partial<typeof facilities.$inferInsert> = {};
  if (patch.name !== undefined) {
    const trimmed = patch.name.trim();
    if (!trimmed) {
      const t = await getTranslations("builder.error");
      throw new Error(t("nameRequired"));
    }
    values.name = trimmed;
  }
  if (patch.widthM !== undefined) values.widthM = Math.max(6, round2(patch.widthM));
  if (patch.heightM !== undefined) values.heightM = Math.max(6, round2(patch.heightM));

  await db.update(facilities).set(values).where(eq(facilities.id, facilityId));
  revalidatePath("/builder");
}

export async function getFacilityLocations(facilityId: string) {
  await requireOwnedFacility(facilityId);
  return db.select().from(locations).where(eq(locations.facilityId, facilityId));
}

export async function getBlueprint(facilityId: string) {
  await requireOwnedFacility(facilityId);

  const rows = await db.select().from(locations).where(eq(locations.facilityId, facilityId));
  const binIds = rows.filter((l) => l.isBin).map((l) => l.id);

  const occupied = binIds.length
    ? await db
        .select({ locationId: stock.locationId })
        .from(stock)
        .where(and(inArray(stock.locationId, binIds), gt(stock.quantity, 0)))
    : [];

  return { locations: rows, occupiedBinIds: occupied.map((o) => o.locationId) };
}

function binChildren(
  facilityId: string,
  parentId: string,
  parentCode: string,
  count: number,
  binLabel: string,
  offset = 0,
) {
  return Array.from({ length: count }, (_, i) => ({
    facilityId,
    parentId,
    kind: "bin" as LocationKind,
    name: binLabel,
    code: bayCode(parentCode, offset + i + 1),
    isBin: true,
    xM: 0,
    yM: 0,
    widthM: 1,
    heightM: 1,
    bays: 1,
  }));
}

export async function createEntity(
  facilityId: string,
  kind: LocationKind,
  xM: number,
  yM: number,
) {
  await requireOwnedFacility(facilityId);

  const type = LOCATION_TYPES[kind];
  const existing = await db.select().from(locations).where(eq(locations.facilityId, facilityId));
  const zones = existing.filter((l) => l.kind === "zone");
  const box = { xM: round2(xM), yM: round2(yM), widthM: type.w, heightM: type.h };

  const containingZone =
    kind === "zone"
      ? null
      : (zones.find(
          (z) =>
            box.xM + box.widthM / 2 >= z.xM &&
            box.xM + box.widthM / 2 <= z.xM + z.widthM &&
            box.yM + box.heightM / 2 >= z.yM &&
            box.yM + box.heightM / 2 <= z.yM + z.heightM,
        ) ?? null);

  const existingCodes = existing.map((l) => l.code).filter((c): c is string => !!c);
  const code = nextCode(kind, containingZone?.code ?? null, existingCodes);
  const isLeaf = type.spatial === "store" && type.bays <= 1;

  const tKind = await getTranslations("builder.kind");

  const [created] = await db
    .insert(locations)
    .values({
      facilityId,
      parentId: containingZone?.id ?? null,
      kind,
      name: tKind(kind).toUpperCase(),
      code,
      isBin: isLeaf,
      xM: box.xM,
      yM: box.yM,
      widthM: box.widthM,
      heightM: box.heightM,
      bays: type.spatial === "store" ? type.bays : 1,
    })
    .returning();

  if (type.spatial === "store" && type.bays > 1) {
    const binLabel = tKind("bin").toUpperCase();
    await db.insert(locations).values(binChildren(facilityId, created.id, code, type.bays, binLabel));
  }

  revalidatePath("/builder");
  return created;
}

export async function updateEntity(
  id: string,
  patch: {
    name?: string;
    code?: string;
    xM?: number;
    yM?: number;
    widthM?: number;
    heightM?: number;
    bays?: number;
  },
) {
  const location = await requireOwnedLocation(id);
  const type = LOCATION_TYPES[location.kind as LocationKind];
  const t = await getTranslations("builder.error");

  const values: Partial<typeof locations.$inferInsert> = {};
  if (patch.name !== undefined) {
    const trimmed = patch.name.trim();
    if (!trimmed) throw new Error(t("nameRequired"));
    values.name = trimmed;
  }
  if (patch.code !== undefined) {
    const trimmed = patch.code.trim().toUpperCase();
    if (!trimmed) throw new Error(t("codeRequired"));
    const clash = await db
      .select()
      .from(locations)
      .where(and(eq(locations.facilityId, location.facilityId), eq(locations.code, trimmed)));
    if (clash.some((c) => c.id !== id)) {
      throw new Error(t("codeInUse", { code: trimmed }));
    }
    values.code = trimmed;
  }
  if (patch.xM !== undefined) values.xM = Math.max(0, round2(patch.xM));
  if (patch.yM !== undefined) values.yM = Math.max(0, round2(patch.yM));
  if (patch.widthM !== undefined) values.widthM = Math.max(0.3, round2(patch.widthM));
  if (patch.heightM !== undefined) values.heightM = Math.max(0.3, round2(patch.heightM));

  if (patch.bays !== undefined && type.spatial === "store") {
    const bays = Math.max(1, Math.min(48, Math.round(patch.bays)));
    const children = await db
      .select()
      .from(locations)
      .where(eq(locations.parentId, id))
      .orderBy(locations.code);

    if (bays === 1 && children.length > 0) {
      // Collapsing back to a single leaf — the parent itself becomes the bin.
      const ids = children.map((c) => c.id);
      const withStock = await db
        .select({ locationId: stock.locationId })
        .from(stock)
        .where(and(inArray(stock.locationId, ids), gt(stock.quantity, 0)));
      if (withStock.length > 0) {
        throw new Error(t("baysReduce"));
      }
      await db.delete(locations).where(inArray(locations.id, ids));
      values.isBin = true;
    } else if (bays > children.length) {
      const code = patch.code?.trim().toUpperCase() ?? location.code ?? location.name;
      const tKind = await getTranslations("builder.kind");
      const toAdd = binChildren(
        location.facilityId,
        id,
        code,
        bays - children.length,
        tKind("bin").toUpperCase(),
        children.length,
      );
      await db.insert(locations).values(toAdd);
      values.isBin = false;
    } else if (bays < children.length) {
      const removed = children.slice(bays);
      const ids = removed.map((c) => c.id);
      const withStock = await db
        .select({ locationId: stock.locationId })
        .from(stock)
        .where(and(inArray(stock.locationId, ids), gt(stock.quantity, 0)));
      if (withStock.length > 0) {
        throw new Error(t("baysReduce"));
      }
      await db.delete(locations).where(inArray(locations.id, ids));
    }
    values.bays = bays;
  }

  if (Object.keys(values).length > 0) {
    await db.update(locations).set(values).where(eq(locations.id, id));
  }

  revalidatePath("/builder");
}

async function descendantIds(rootId: string): Promise<string[]> {
  const ids: string[] = [];
  let frontier = [rootId];
  while (frontier.length > 0) {
    const children = await db
      .select({ id: locations.id })
      .from(locations)
      .where(inArray(locations.parentId, frontier));
    frontier = children.map((c) => c.id);
    ids.push(...frontier);
  }
  return ids;
}

export async function deleteEntity(id: string) {
  await requireOwnedLocation(id);

  const ids = [id, ...(await descendantIds(id))];
  const withStock = await db
    .select({ locationId: stock.locationId })
    .from(stock)
    .where(and(inArray(stock.locationId, ids), gt(stock.quantity, 0)));
  if (withStock.length > 0) {
    const t = await getTranslations("builder.error");
    throw new Error(t("deleteHasStock"));
  }

  await db.delete(locations).where(eq(locations.id, id));
  revalidatePath("/builder");
}

export async function duplicateEntity(id: string) {
  const location = await requireOwnedLocation(id);
  return createEntity(
    location.facilityId,
    location.kind as LocationKind,
    round2(location.xM + 0.5),
    round2(location.yM + 0.5),
  );
}
