// The underlay's client-safe half: limits, the metadata shape and the image
// URL. src/lib/underlay.ts (server) re-exports these and adds the queries.

export const UNDERLAY_MAX_BYTES = 4 * 1024 * 1024;
export const UNDERLAY_MIME = ["image/png", "image/jpeg", "image/webp"] as const;

// Everything the canvas needs to draw the underlay — never the bytes, which
// are served separately by /api/builder/underlay/[facilityId] so a
// blueprint reload doesn't ship a megabyte of image with it.
export type UnderlayMeta = {
  widthPx: number;
  heightPx: number;
  scale: number; // metres per pixel
  offsetXM: number;
  offsetYM: number;
  opacity: number;
  visible: boolean;
  version: number; // updatedAt as ms — cache-busts the image URL
};

export function underlayUrl(facilityId: string, version: number) {
  return `/api/builder/underlay/${facilityId}?v=${version}`;
}

// Two points clicked on the floor (metres) and the real distance between
// them → the underlay's new scale, with the offset moved so the *first*
// point stays exactly where the user put it. Null when the points are too
// close to measure anything.
export function calibrateUnderlay(
  meta: Pick<UnderlayMeta, "scale" | "offsetXM" | "offsetYM">,
  a: { x: number; y: number },
  b: { x: number; y: number },
  distanceM: number,
): { scale: number; offsetXM: number; offsetYM: number } | null {
  const pxA = { x: (a.x - meta.offsetXM) / meta.scale, y: (a.y - meta.offsetYM) / meta.scale };
  const pxB = { x: (b.x - meta.offsetXM) / meta.scale, y: (b.y - meta.offsetYM) / meta.scale };
  const px = Math.hypot(pxB.x - pxA.x, pxB.y - pxA.y);
  if (px < 1 || !(distanceM > 0)) return null;
  const scale = distanceM / px;
  return { scale, offsetXM: a.x - pxA.x * scale, offsetYM: a.y - pxA.y * scale };
}
