import { eq } from "drizzle-orm";
import { db } from "@/db";
import { facilities, facilityUnderlays } from "@/db/schema";
import { getMyOrgId } from "@/lib/session";

export { UNDERLAY_MAX_BYTES, UNDERLAY_MIME, underlayUrl, type UnderlayMeta } from "./underlay-shared";
import type { UnderlayMeta } from "./underlay-shared";

// A facility the current user's organization owns, or null. Used by the
// route handler too, which has no server-action error plumbing.
export async function ownedFacility(facilityId: string) {
  const organizationId = await getMyOrgId();
  if (!organizationId) return null;
  const [facility] = await db.select().from(facilities).where(eq(facilities.id, facilityId));
  return facility && facility.organizationId === organizationId ? facility : null;
}

export async function getUnderlayMeta(facilityId: string): Promise<UnderlayMeta | null> {
  const [row] = await db
    .select({
      widthPx: facilityUnderlays.widthPx,
      heightPx: facilityUnderlays.heightPx,
      scale: facilityUnderlays.scale,
      offsetXM: facilityUnderlays.offsetXM,
      offsetYM: facilityUnderlays.offsetYM,
      opacity: facilityUnderlays.opacity,
      visible: facilityUnderlays.visible,
      updatedAt: facilityUnderlays.updatedAt,
    })
    .from(facilityUnderlays)
    .where(eq(facilityUnderlays.facilityId, facilityId));
  if (!row) return null;
  const { updatedAt, ...meta } = row;
  return { ...meta, version: updatedAt.getTime() };
}

export async function getUnderlayImage(facilityId: string) {
  const [row] = await db
    .select({ mimeType: facilityUnderlays.mimeType, data: facilityUnderlays.data, updatedAt: facilityUnderlays.updatedAt })
    .from(facilityUnderlays)
    .where(eq(facilityUnderlays.facilityId, facilityId));
  return row ?? null;
}

// A new image replaces the old one whole. It lands fitted to the floor's
// width at the top-left corner — a sensible first guess the two-point
// calibration then corrects — and keeps the previous opacity/visibility so
// swapping a better scan doesn't reset the user's viewing choices.
export async function putUnderlay(
  facility: { id: string; widthM: number },
  file: { mimeType: string; data: Buffer; widthPx: number; heightPx: number },
) {
  const scale = facility.widthM / file.widthPx;
  const now = new Date();
  await db
    .insert(facilityUnderlays)
    .values({ facilityId: facility.id, ...file, scale, offsetXM: 0, offsetYM: 0, updatedAt: now })
    .onConflictDoUpdate({
      target: facilityUnderlays.facilityId,
      set: { mimeType: file.mimeType, data: file.data, widthPx: file.widthPx, heightPx: file.heightPx, scale, offsetXM: 0, offsetYM: 0, updatedAt: now },
    });
}

export async function patchUnderlay(
  facilityId: string,
  patch: Partial<Pick<UnderlayMeta, "scale" | "offsetXM" | "offsetYM" | "opacity" | "visible">>,
) {
  await db.update(facilityUnderlays).set({ ...patch, updatedAt: new Date() }).where(eq(facilityUnderlays.facilityId, facilityId));
}

export async function deleteUnderlay(facilityId: string) {
  await db.delete(facilityUnderlays).where(eq(facilityUnderlays.facilityId, facilityId));
}
