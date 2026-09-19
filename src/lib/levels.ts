import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import { facilityLevels, locations, stock } from "@/db/schema";
import { UserError } from "@/lib/user-error";

// A facility's levels: the list its racks are allowed to span. Two by
// default (the "ground + one shelf above" a small depot starts with);
// admins add, rename and remove from the builder. Levels are indexed
// 1..n and bin codes stay numeric (A-01-2-3 = level 2, bay 3), so a
// rename never invalidates a printed label.

export const DEFAULT_LEVELS = 2;
export const MAX_FACILITY_LEVELS = 8;

export type FacilityLevel = { id: string; index: number; name: string | null };

// Lazy default for facilities created before the levels table existed
// or by a path that didn't create them — the migration backfills, this is
// the belt to its braces.
export async function ensureLevels(facilityId: string): Promise<FacilityLevel[]> {
  const rows = await db
    .select({ id: facilityLevels.id, index: facilityLevels.index, name: facilityLevels.name })
    .from(facilityLevels)
    .where(eq(facilityLevels.facilityId, facilityId))
    .orderBy(asc(facilityLevels.index));
  if (rows.length > 0) return rows;

  const [{ max }] = await db
    .select({ max: sql<number | null>`max(${locations.levels})` })
    .from(locations)
    .where(eq(locations.facilityId, facilityId));
  const count = Math.max(DEFAULT_LEVELS, max ?? 1);
  await db
    .insert(facilityLevels)
    .values(Array.from({ length: count }, (_, i) => ({ facilityId, index: i + 1 })))
    .onConflictDoNothing();
  return ensureLevels(facilityId);
}

export async function addLevel(facilityId: string): Promise<FacilityLevel> {
  const current = await ensureLevels(facilityId);
  if (current.length >= MAX_FACILITY_LEVELS) {
    const t = await getTranslations("builder.levels");
    throw new UserError(t("errorMax", { max: MAX_FACILITY_LEVELS }));
  }
  const [row] = await db
    .insert(facilityLevels)
    .values({ facilityId, index: current.length + 1 })
    .returning({ id: facilityLevels.id, index: facilityLevels.index, name: facilityLevels.name });
  return row;
}

export async function renameLevel(facilityId: string, levelId: string, name: string | null) {
  await db
    .update(facilityLevels)
    .set({ name: name?.trim() || null })
    .where(and(eq(facilityLevels.id, levelId), eq(facilityLevels.facilityId, facilityId)));
}

// Only the top level can go (a level in the middle would renumber every
// bin above it and every label already stuck on them), and only when no
// bin on it holds stock. Racks that reached it lose that level.
export async function removeTopLevel(facilityId: string) {
  const t = await getTranslations("builder.levels");
  const current = await ensureLevels(facilityId);
  if (current.length <= 1) throw new UserError(t("errorLast"));
  const top = current[current.length - 1];

  const binsOnTop = await db
    .select({ id: locations.id, code: locations.code })
    .from(locations)
    .where(and(eq(locations.facilityId, facilityId), eq(locations.isBin, true), eq(locations.level, top.index)));
  if (binsOnTop.length > 0) {
    const stocked = await db
      .select({ locationId: stock.locationId })
      .from(stock)
      .where(and(inArray(stock.locationId, binsOnTop.map((b) => b.id)), gt(stock.quantity, 0)));
    if (stocked.length > 0) {
      const codes = binsOnTop.filter((b) => stocked.some((s) => s.locationId === b.id)).map((b) => b.code).slice(0, 3);
      throw new UserError(t("errorStock", { level: top.index, codes: codes.join(", "), n: stocked.length }));
    }
  }
  await db.delete(facilityLevels).where(eq(facilityLevels.id, top.id));
  return top;
}
