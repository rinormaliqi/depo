"use server";

import { and, eq, gt, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import { facilities, locations, stock, type LocationKind } from "@/db/schema";
import {
  bayCode,
  buildTemplate,
  computeZoneSlots,
  detectOrientation,
  findContainingZone,
  LOCATION_TYPES,
  nextCode,
  rescaleWithinZone,
  round2,
  type Box,
  type TemplateKey,
} from "@/lib/blueprint-types";
import { assertCanAddBins } from "@/lib/plan-limits";
import { addLevel as addLevelRow, ensureLevels, removeTopLevel as removeTopLevelRow, renameLevel as renameLevelRow, type FacilityLevel } from "@/lib/levels";
import { requirePermission } from "@/lib/permissions";
import { currentFacility, listFacilities, rememberFacility } from "@/lib/facilities";
import { getCapabilitiesFor, requireCapability, requireRoom } from "@/lib/capabilities";
import { getMyOrgId, getMySession, requireOrgId } from "@/lib/session";
import { attempt } from "@/lib/action-result";
import { UserError } from "@/lib/user-error";

export type LocationRow = typeof locations.$inferSelect;

const MAX_BAYS = 48;

async function requireOwnedFacility(facilityId: string) {
  const organizationId = await requireOrgId();

  const [facility] = await db.select().from(facilities).where(eq(facilities.id, facilityId));
  if (!facility || facility.organizationId !== organizationId) {
    const t = await getTranslations("builder.error");
    throw new UserError(t("facilityNotFound"));
  }

  return facility;
}

async function requireOwnedLocation(locationId: string) {
  const organizationId = await requireOrgId();
  const t = await getTranslations("builder.error");

  const [location] = await db.select().from(locations).where(eq(locations.id, locationId));
  if (!location) throw new UserError(t("locationNotFound"));

  const [facility] = await db
    .select()
    .from(facilities)
    .where(eq(facilities.id, location.facilityId));
  if (!facility || facility.organizationId !== organizationId) {
    throw new UserError(t("locationNotFound"));
  }

  return { ...location, organizationId };
}

// The facility the user is currently working in — the one the facility
// cookie points at, or the org's first (see src/lib/facilities.ts). Every
// facility-scoped page and action reads through this, so switching is a
// cookie write and nothing else has to know there's more than one.
export async function getMyFacility() {
  const organizationId = await getMyOrgId();
  if (!organizationId) return null;
  return currentFacility(organizationId);
}

// What the header's switcher needs in one round trip: the org's
// facilities and whether this user may add one.
export async function getMyFacilities() {
  const session = await getMySession();
  if (!session) return { facilities: [], canAdd: false };
  const rows = await listFacilities(session.organizationId);
  const caps = await getCapabilitiesFor(session.organizationId, session.role);
  const room = caps.limits.facilities.max === null || caps.limits.facilities.used < caps.limits.facilities.max;
  return { facilities: rows.map((f) => ({ id: f.id, name: f.name })), canAdd: caps.can.multiFacility && caps.can.editLayout && room };
}

export async function switchFacility(facilityId: string) {
  await requireOwnedFacility(facilityId);
  await rememberFacility(facilityId);
  // Everything facility-scoped is rendered from getMyFacility(), so a
  // layout-wide revalidate is the honest scope here, not a single path.
  revalidatePath("/", "layout");
}

async function createFacilityImpl(name: string) {
  const { organizationId } = await requirePermission("editLayout");
  const trimmed = name.trim();
  if (!trimmed) {
    const t = await getTranslations("builder.error");
    throw new UserError(t("nameRequired"));
  }
  await requireCapability("multiFacility");
  await requireRoom(organizationId, "facilities", 1);
  const [facility] = await db.insert(facilities).values({ organizationId, name: trimmed }).returning();
  await rememberFacility(facility.id);
  revalidatePath("/", "layout");
  return facility;
}

export async function createFacility(name: string) {
  return attempt(() => createFacilityImpl(name), "createFacility");
}

async function updateFacilityImpl(
  facilityId: string,
  patch: { name?: string; widthM?: number; heightM?: number },
) {
  await requirePermission("editLayout");
  await requireOwnedFacility(facilityId);

  const values: Partial<typeof facilities.$inferInsert> = {};
  if (patch.name !== undefined) {
    const trimmed = patch.name.trim();
    if (!trimmed) {
      const t = await getTranslations("builder.error");
      throw new UserError(t("nameRequired"));
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

  const levels = await ensureLevels(facilityId);
  return { locations: rows, occupiedBinIds: occupied.map((o) => o.locationId), levels };
}

function gridBinRows(
  facilityId: string,
  parentId: string,
  parentCode: string,
  bays: number,
  levels: number,
  binLabel: string,
) {
  const rows: (typeof locations.$inferInsert)[] = [];
  for (let level = 1; level <= levels; level++) {
    for (let bay = 1; bay <= bays; bay++) {
      rows.push({
        facilityId,
        parentId,
        kind: "bin" as LocationKind,
        name: binLabel,
        code: bayCode(parentCode, level, bay, levels),
        isBin: true,
        xM: 0,
        yM: 0,
        widthM: 1,
        heightM: 1,
        bays: 1,
        levels: 1,
        bay,
        level,
      });
    }
  }
  return rows;
}

async function checkNoStock(
  ids: string[],
  errorKey: "baysReduce" | "replaceHasStock" | "deleteHasStock" = "baysReduce",
) {
  if (ids.length === 0) return;
  const withStock = await db
    .select({ locationId: stock.locationId })
    .from(stock)
    .where(and(inArray(stock.locationId, ids), gt(stock.quantity, 0)));
  if (withStock.length > 0) {
    const t = await getTranslations("builder.error");
    throw new UserError(t(errorKey));
  }
}

async function createEntityAt(
  facilityId: string,
  kind: LocationKind,
  box: Box,
  bays: number,
  levels: number,
) {
  const type = LOCATION_TYPES[kind];
  const existing = await db.select().from(locations).where(eq(locations.facilityId, facilityId));
  const zones = existing.filter((l) => l.kind === "zone");

  const containingZone = kind === "zone" ? null : findContainingZone(zones, box);

  const existingCodes = existing.map((l) => l.code).filter((c): c is string => !!c);
  const code = nextCode(kind, containingZone?.code ?? null, existingCodes);
  const isLeaf = type.spatial === "store" && bays <= 1 && levels <= 1;

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
      bays: type.spatial === "store" ? bays : 1,
      levels: type.spatial === "store" ? levels : 1,
    })
    .returning();

  if (type.spatial === "store" && !isLeaf) {
    const binLabel = tKind("bin").toUpperCase();
    await db.insert(locations).values(gridBinRows(facilityId, created.id, code, bays, levels, binLabel));
  }

  return created;
}

async function createEntityImpl(
  facilityId: string,
  kind: LocationKind,
  xM: number,
  yM: number,
) {
  await requirePermission("editLayout");
  const facility = await requireOwnedFacility(facilityId);

  const type = LOCATION_TYPES[kind];
  if (type.spatial === "store") {
    await assertCanAddBins(facility.organizationId, type.bays * type.levels);
  }

  const created = await createEntityAt(
    facilityId,
    kind,
    { xM: round2(xM), yM: round2(yM), widthM: type.w, heightM: type.h },
    type.bays,
    type.levels,
  );

  revalidatePath("/builder");
  return created;
}

async function applyTemplateImpl(facilityId: string, templateKey: TemplateKey, replace: boolean) {
  await requirePermission("editLayout");
  const facility = await requireOwnedFacility(facilityId);

  const existing = await db.select({ id: locations.id }).from(locations).where(eq(locations.facilityId, facilityId));
  if (existing.length > 0) {
    if (!replace) {
      const t = await getTranslations("builder.error");
      throw new UserError(t("confirmationRequired"));
    }
    // The scheme's structure can be freely replaced once confirmed — but
    // real stock is never silently destroyed, confirmation or not.
    await checkNoStock(existing.map((l) => l.id), "replaceHasStock");
    await db.delete(locations).where(eq(locations.facilityId, facilityId));
  }

  const specs = buildTemplate(templateKey, facility.widthM, facility.heightM);

  // Check the whole template's bin total upfront rather than per-entity as
  // the loop below goes — discovering the plan doesn't have room for it
  // partway through inserting a dozen racks would be a bad place to fail.
  const totalBins = specs.reduce(
    (sum, spec) => sum + (LOCATION_TYPES[spec.kind].spatial === "store" ? spec.bays * spec.levels : 0),
    0,
  );
  await assertCanAddBins(facility.organizationId, totalBins);

  for (const spec of specs) {
    await createEntityAt(
      facilityId,
      spec.kind,
      { xM: spec.xM, yM: spec.yM, widthM: spec.widthM, heightM: spec.heightM },
      spec.bays,
      spec.levels,
    );
  }

  revalidatePath("/builder");
}

// Adds one more top-level zone by proportionally shrinking the existing
// zones (and rescaling their direct contents along with them) to make room,
// rather than just dropping a new zone on top of whatever's already there.
// Scoped to zones and their own children — an aisle or dock placed
// independently of any zone is left where it is.
async function addSectorImpl(facilityId: string) {
  await requirePermission("editLayout");
  const facility = await requireOwnedFacility(facilityId);

  const all = await db.select().from(locations).where(eq(locations.facilityId, facilityId));
  const zones = all.filter((l) => l.kind === "zone");

  const orientation = detectOrientation(zones.map((z) => ({ xM: z.xM, yM: z.yM, widthM: z.widthM, heightM: z.heightM })));
  const slots = computeZoneSlots(zones.length, facility.widthM, facility.heightM, orientation);

  const sortedZones = [...zones].sort((a, b) => (orientation === "vertical" ? a.xM - b.xM : a.yM - b.yM));

  for (let i = 0; i < sortedZones.length; i++) {
    const zone = sortedZones[i];
    const oldBox: Box = { xM: zone.xM, yM: zone.yM, widthM: zone.widthM, heightM: zone.heightM };
    const newBox = slots[i];
    if (
      oldBox.xM === newBox.xM &&
      oldBox.yM === newBox.yM &&
      oldBox.widthM === newBox.widthM &&
      oldBox.heightM === newBox.heightM
    ) {
      continue;
    }

    await db
      .update(locations)
      .set({ xM: newBox.xM, yM: newBox.yM, widthM: newBox.widthM, heightM: newBox.heightM })
      .where(eq(locations.id, zone.id));

    const children = all.filter((l) => l.parentId === zone.id);
    for (const child of children) {
      const rescaled = rescaleWithinZone(
        { xM: child.xM, yM: child.yM, widthM: child.widthM, heightM: child.heightM },
        oldBox,
        newBox,
      );
      await db.update(locations).set(rescaled).where(eq(locations.id, child.id));
    }
  }

  const newZoneBox = slots[slots.length - 1];
  const created = await createEntityAt(facilityId, "zone", newZoneBox, 1, 1);

  revalidatePath("/builder");
  return created;
}

async function reshapeGrid(
  parentId: string,
  code: string,
  currentLevels: number,
  newBays: number,
  newLevels: number,
) {
  const children = await db.select().from(locations).where(eq(locations.parentId, parentId));

  if (newBays === 1 && newLevels === 1) {
    await checkNoStock(children.map((c) => c.id));
    if (children.length > 0) {
      await db.delete(locations).where(inArray(locations.id, children.map((c) => c.id)));
    }
    return;
  }

  const toRemove = children.filter((c) => (c.level ?? 1) > newLevels || (c.bay ?? 1) > newBays);
  await checkNoStock(toRemove.map((c) => c.id));
  if (toRemove.length > 0) {
    await db.delete(locations).where(inArray(locations.id, toRemove.map((c) => c.id)));
  }

  const formatChanged = currentLevels > 1 !== newLevels > 1;
  const toKeep = children.filter((c) => (c.level ?? 1) <= newLevels && (c.bay ?? 1) <= newBays);
  if (formatChanged) {
    for (const c of toKeep) {
      const newCode = bayCode(code, c.level ?? 1, c.bay ?? 1, newLevels);
      if (newCode !== c.code) {
        await db.update(locations).set({ code: newCode }).where(eq(locations.id, c.id));
      }
    }
  }

  const existingKeys = new Set(toKeep.map((c) => `${c.level ?? 1}-${c.bay ?? 1}`));
  const toAdd: (typeof locations.$inferInsert)[] = [];
  const tKind = await getTranslations("builder.kind");
  const binLabel = tKind("bin").toUpperCase();
  for (let level = 1; level <= newLevels; level++) {
    for (let bay = 1; bay <= newBays; bay++) {
      if (!existingKeys.has(`${level}-${bay}`)) {
        toAdd.push({
          facilityId: children[0]?.facilityId,
          parentId,
          kind: "bin" as LocationKind,
          name: binLabel,
          code: bayCode(code, level, bay, newLevels),
          isBin: true,
          xM: 0,
          yM: 0,
          widthM: 1,
          heightM: 1,
          bays: 1,
          levels: 1,
          bay,
          level,
        } as typeof locations.$inferInsert);
      }
    }
  }
  if (toAdd.length > 0) {
    await db.insert(locations).values(toAdd);
  }
}

async function updateEntityImpl(
  id: string,
  patch: {
    name?: string;
    code?: string;
    xM?: number;
    yM?: number;
    widthM?: number;
    heightM?: number;
    bays?: number;
    levels?: number;
  },
) {
  await requirePermission("editLayout");
  const location = await requireOwnedLocation(id);
  const type = LOCATION_TYPES[location.kind as LocationKind];
  const t = await getTranslations("builder.error");

  const values: Partial<typeof locations.$inferInsert> = {};
  if (patch.name !== undefined) {
    const trimmed = patch.name.trim();
    if (!trimmed) throw new UserError(t("nameRequired"));
    values.name = trimmed;
  }
  if (patch.code !== undefined) {
    const trimmed = patch.code.trim().toUpperCase();
    if (!trimmed) throw new UserError(t("codeRequired"));
    const clash = await db
      .select()
      .from(locations)
      .where(and(eq(locations.facilityId, location.facilityId), eq(locations.code, trimmed)));
    if (clash.some((c) => c.id !== id)) {
      throw new UserError(t("codeInUse", { code: trimmed }));
    }
    values.code = trimmed;
  }
  if (patch.xM !== undefined) values.xM = Math.max(0, round2(patch.xM));
  if (patch.yM !== undefined) values.yM = Math.max(0, round2(patch.yM));
  if (patch.widthM !== undefined) values.widthM = Math.max(0.3, round2(patch.widthM));
  if (patch.heightM !== undefined) values.heightM = Math.max(0.3, round2(patch.heightM));

  // Dragging (or typing new coordinates) can move a non-zone entity into a
  // different zone's bounds, or out of any zone — re-derive its parent from
  // the new position rather than leaving it pointing at a zone it no longer
  // visually sits in. Its code is untouched: moving doesn't rename it.
  if (
    location.kind !== "zone" &&
    (patch.xM !== undefined || patch.yM !== undefined || patch.widthM !== undefined || patch.heightM !== undefined)
  ) {
    const box = {
      xM: values.xM ?? location.xM,
      yM: values.yM ?? location.yM,
      widthM: values.widthM ?? location.widthM,
      heightM: values.heightM ?? location.heightM,
    };
    const zones = await db
      .select()
      .from(locations)
      .where(and(eq(locations.facilityId, location.facilityId), eq(locations.kind, "zone")));
    const containingZone = findContainingZone(zones, box);
    const newParentId = containingZone?.id ?? null;
    if (newParentId !== location.parentId) {
      values.parentId = newParentId;
    }
  }

  if ((patch.bays !== undefined || patch.levels !== undefined) && type.spatial === "store") {
    const newBays = Math.max(1, Math.min(MAX_BAYS, Math.round(patch.bays ?? location.bays)));
    // A rack can span at most the levels its facility has.
    const facilityLevelCount = (await ensureLevels(location.facilityId)).length;
    const newLevels = Math.max(1, Math.min(facilityLevelCount, Math.round(patch.levels ?? location.levels)));
    const code = (values.code as string | undefined) ?? location.code ?? location.name;

    // The grid always stays dense (no gaps), so the net bin-count change is
    // just the before/after cell totals — growing from 6 bays/1 level to
    // 6 bays/2 levels adds exactly 6, regardless of which specific cells
    // reshapeGrid ends up adding or removing to get there.
    const binDelta = newBays * newLevels - location.bays * location.levels;
    if (binDelta > 0) {
      await assertCanAddBins(location.organizationId, binDelta);
    }

    await reshapeGrid(id, code, location.levels, newBays, newLevels);

    values.bays = newBays;
    values.levels = newLevels;
    values.isBin = newBays === 1 && newLevels === 1;
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

async function deleteEntityImpl(id: string) {
  await requirePermission("editLayout");
  await requireOwnedLocation(id);

  const ids = [id, ...(await descendantIds(id))];
  await checkNoStock(ids, "deleteHasStock");

  await db.delete(locations).where(eq(locations.id, id));
  revalidatePath("/builder");
}

async function duplicateEntityImpl(id: string) {
  await requirePermission("editLayout");
  const location = await requireOwnedLocation(id);
  if (LOCATION_TYPES[location.kind as LocationKind].spatial === "store") {
    await assertCanAddBins(location.organizationId, location.bays * location.levels);
  }
  const created = await createEntityAt(
    location.facilityId,
    location.kind as LocationKind,
    { xM: round2(location.xM + 0.5), yM: round2(location.yM + 0.5), widthM: location.widthM, heightM: location.heightM },
    location.bays,
    location.levels,
  );
  revalidatePath("/builder");
  return created;
}

// Thin public wrapper around createEntityAt for the builder's undo/redo
// stack: recreating a just-deleted (or since-undone) entity needs its exact
// prior kind/box/bays/levels, not a kind's defaults — the same distinction
// duplicateEntity above already gets right, just driven by a caller-supplied
// spec instead of an existing row.
async function restoreEntityImpl(
  facilityId: string,
  spec: { kind: LocationKind; xM: number; yM: number; widthM: number; heightM: number; bays: number; levels: number },
) {
  await requirePermission("editLayout");
  const facility = await requireOwnedFacility(facilityId);
  if (LOCATION_TYPES[spec.kind].spatial === "store") {
    await assertCanAddBins(facility.organizationId, spec.bays * spec.levels);
  }
  const created = await createEntityAt(
    facilityId,
    spec.kind,
    { xM: spec.xM, yM: spec.yM, widthM: spec.widthM, heightM: spec.heightM },
    spec.bays,
    spec.levels,
  );
  revalidatePath("/builder");
  return created;
}

export async function updateFacility(
  facilityId: string,
  patch: { name?: string; widthM?: number; heightM?: number },
) {
  return attempt(() => updateFacilityImpl(facilityId, patch), "updateFacility");
}

export async function createEntity(
  facilityId: string,
  kind: LocationKind,
  xM: number,
  yM: number,
) {
  return attempt(() => createEntityImpl(facilityId, kind, xM, yM), "createEntity");
}

export async function applyTemplate(facilityId: string, templateKey: TemplateKey, replace: boolean) {
  return attempt(() => applyTemplateImpl(facilityId, templateKey, replace), "applyTemplate");
}

export async function addSector(facilityId: string) {
  return attempt(() => addSectorImpl(facilityId), "addSector");
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
    levels?: number;
  },
) {
  return attempt(() => updateEntityImpl(id, patch), "updateEntity");
}

export async function deleteEntity(id: string) {
  return attempt(() => deleteEntityImpl(id), "deleteEntity");
}

export async function duplicateEntity(id: string) {
  return attempt(() => duplicateEntityImpl(id), "duplicateEntity");
}

export async function restoreEntity(
  facilityId: string,
  spec: { kind: LocationKind; xM: number; yM: number; widthM: number; heightM: number; bays: number; levels: number },
) {
  return attempt(() => restoreEntityImpl(facilityId, spec), "restoreEntity");
}

// ── Facility levels (src/lib/levels.ts) ─────────────────────────────────

export async function getFacilityLevels(facilityId: string): Promise<FacilityLevel[]> {
  await requireOwnedFacility(facilityId);
  return ensureLevels(facilityId);
}

async function addLevelImpl(facilityId: string, extendRacks: boolean) {
  await requirePermission("editLayout");
  const facility = await requireOwnedFacility(facilityId);
  const level = await addLevelRow(facilityId);
  if (extendRacks) {
    // Every rack that reached the previous top grows onto the new level:
    // one new bin per bay, counted against the plan first.
    const racks = await db
      .select()
      .from(locations)
      .where(and(eq(locations.facilityId, facilityId), eq(locations.levels, level.index - 1)));
    const storeRacks = racks.filter((r) => LOCATION_TYPES[r.kind as LocationKind].spatial === "store" && !r.isBin);
    await assertCanAddBins(facility.organizationId, storeRacks.reduce((n, r) => n + r.bays, 0));
    for (const rack of storeRacks) {
      await reshapeGrid(rack.id, rack.code ?? rack.name, rack.levels, rack.bays, level.index);
      await db.update(locations).set({ levels: level.index }).where(eq(locations.id, rack.id));
    }
  }
  revalidatePath("/builder");
  return level;
}

async function renameLevelImpl(facilityId: string, levelId: string, name: string | null) {
  await requirePermission("editLayout");
  await requireOwnedFacility(facilityId);
  await renameLevelRow(facilityId, levelId, name);
  revalidatePath("/builder");
}

async function removeTopLevelImpl(facilityId: string) {
  await requirePermission("editLayout");
  await requireOwnedFacility(facilityId);
  const removed = await removeTopLevelRow(facilityId);
  // Racks that spanned the removed level shrink by one (their top-level
  // bins were verified empty by removeTopLevel).
  const racks = await db
    .select()
    .from(locations)
    .where(and(eq(locations.facilityId, facilityId), eq(locations.levels, removed.index)));
  for (const rack of racks) {
    await reshapeGrid(rack.id, rack.code ?? rack.name, rack.levels, rack.bays, removed.index - 1);
    await db.update(locations).set({ levels: removed.index - 1 }).where(eq(locations.id, rack.id));
  }
  revalidatePath("/builder");
  return removed;
}

export async function addLevel(facilityId: string, extendRacks: boolean) {
  return attempt(() => addLevelImpl(facilityId, extendRacks), "addLevel");
}
export async function renameLevel(facilityId: string, levelId: string, name: string | null) {
  return attempt(() => renameLevelImpl(facilityId, levelId, name), "renameLevel");
}
export async function removeTopLevel(facilityId: string) {
  return attempt(() => removeTopLevelImpl(facilityId), "removeTopLevel");
}
