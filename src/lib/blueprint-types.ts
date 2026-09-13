import type { LocationKind } from "@/db/schema";

export type Spatial = "area" | "store" | "fixture";

export const LOCATION_TYPES: Record<
  LocationKind,
  { label: string; spatial: Spatial; w: number; h: number; bays: number }
> = {
  zone: { label: "Zone", spatial: "area", w: 14, h: 9, bays: 1 },
  aisle: { label: "Aisle", spatial: "area", w: 14, h: 2.4, bays: 1 },
  rack: { label: "Rack", spatial: "store", w: 8, h: 1.2, bays: 8 },
  platform: { label: "Platform", spatial: "store", w: 7.5, h: 4, bays: 4 },
  pallet: { label: "Pallet", spatial: "store", w: 1.4, h: 1.4, bays: 1 },
  bin: { label: "Bin", spatial: "store", w: 1, h: 1, bays: 1 },
  dock: { label: "Dock", spatial: "fixture", w: 3.4, h: 2.6, bays: 1 },
  wall: { label: "Wall", spatial: "fixture", w: 8, h: 0.3, bays: 1 },
};

const CODE_SUFFIX: Partial<Record<LocationKind, string>> = {
  aisle: "AI",
  platform: "P",
  bin: "B",
  dock: "D",
  wall: "W",
};

export function round2(v: number) {
  return Math.round(v * 100) / 100;
}

// Which zone (if any) contains the centre of a box — mirrors the design's
// spatial-containment rule, computed once at write time and persisted as
// parentId rather than recomputed on every render.
export function findContainingZone<
  T extends { id: string; kind: string; xM: number; yM: number; widthM: number; heightM: number },
>(zones: T[], box: { xM: number; yM: number; widthM: number; heightM: number }) {
  const cx = box.xM + box.widthM / 2;
  const cy = box.yM + box.heightM / 2;
  return (
    zones.find(
      (z) => cx >= z.xM && cx <= z.xM + z.widthM && cy >= z.yM && cy <= z.yM + z.heightM,
    ) ?? null
  );
}

// Mirrors the design's nextCode(): zone codes are letters (A, B, C…); every
// other kind is prefixed by its containing zone's code (or the kind's own
// initial if it sits outside any zone), then a running count within that stem.
export function nextCode(
  kind: LocationKind,
  zoneCode: string | null,
  existingCodes: string[],
): string {
  if (kind === "zone") {
    const usedLetters = new Set(
      existingCodes.filter((c) => /^[A-Z]$/.test(c)),
    );
    for (let i = 0; i < 26; i++) {
      const letter = String.fromCharCode(65 + i);
      if (!usedLetters.has(letter)) return letter;
    }
    return "Z" + (existingCodes.length + 1);
  }

  const pre = zoneCode ?? LOCATION_TYPES[kind].label.charAt(0).toUpperCase();
  const suf = CODE_SUFFIX[kind] ?? "";
  const stem = pre + "-" + suf;
  // Match direct siblings only (stem + digits, nothing more) — a plain
  // startsWith would also match a sibling's own auto-generated bay children
  // (e.g. "A-01-1" starts with "A-" too), inflating the count.
  const n =
    existingCodes.filter((c) => c.startsWith(stem) && /^\d+$/.test(c.slice(stem.length))).length +
    1;
  return stem + (suf ? String(n) : String(n).padStart(2, "0"));
}

export function bayCode(parentCode: string, bay: number) {
  return `${parentCode}-${bay}`;
}

export interface TemplateEntitySpec {
  kind: LocationKind;
  xM: number;
  yM: number;
  widthM: number;
  heightM: number;
  bays: number;
}

export const TEMPLATE_KEYS = ["simple", "yard"] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

// Positions/sizes are fractions of the facility's actual width/height, so a
// template fits whatever floor envelope the user already set up — except a
// "store" kind's depth (height), which stays at its real-world default
// (LOCATION_TYPES[kind].h) rather than stretching with the floor, since a
// rack is always ~1.2 m deep regardless of how big the building is. Zones
// scale freely in both dimensions since they're arbitrary boundaries, not
// physical objects. Entities are ordered zones-first so each subsequent
// "store" entity's centre already falls inside its intended zone, letting
// the normal containment/code-generation logic in createEntityAt just work.
export function buildTemplate(key: TemplateKey, floorW: number, floorH: number): TemplateEntitySpec[] {
  const rackH = LOCATION_TYPES.rack.h;

  if (key === "simple") {
    const zone = { xM: round2(0.05 * floorW), yM: round2(0.08 * floorH), widthM: round2(0.9 * floorW), heightM: round2(0.84 * floorH) };
    const rackW = round2(0.35 * floorW);
    const rackX = round2(zone.xM + 0.08 * floorW);
    const gapY = Math.max(0.6, round2(0.1 * floorH));
    return [
      { kind: "zone", ...zone, bays: 1 },
      { kind: "rack", xM: rackX, yM: round2(zone.yM + gapY), widthM: rackW, heightM: rackH, bays: 6 },
      { kind: "rack", xM: rackX, yM: round2(zone.yM + gapY * 2 + rackH), widthM: rackW, heightM: rackH, bays: 6 },
    ];
  }

  // "yard": a racking zone, a bulk-floor zone, and a standalone loading dock.
  const zoneA = { xM: round2(0.04 * floorW), yM: round2(0.06 * floorH), widthM: round2(0.5 * floorW), heightM: round2(0.5 * floorH) };
  const zoneB = { xM: round2(0.04 * floorW), yM: round2(0.62 * floorH), widthM: round2(0.5 * floorW), heightM: round2(0.32 * floorH) };
  const rackW = round2(0.18 * floorW);
  const dock = LOCATION_TYPES.dock;

  return [
    { kind: "zone", ...zoneA, bays: 1 },
    { kind: "rack", xM: round2(zoneA.xM + 0.06 * floorW), yM: round2(zoneA.yM + 0.1 * floorH), widthM: rackW, heightM: rackH, bays: 6 },
    { kind: "rack", xM: round2(zoneA.xM + 0.28 * floorW), yM: round2(zoneA.yM + 0.1 * floorH), widthM: rackW, heightM: rackH, bays: 6 },
    { kind: "zone", ...zoneB, bays: 1 },
    { kind: "platform", xM: round2(zoneB.xM + 0.06 * floorW), yM: round2(zoneB.yM + 0.08 * floorH), widthM: round2(0.4 * floorW), heightM: round2(0.5 * zoneB.heightM), bays: 4 },
    { kind: "dock", xM: round2(0.62 * floorW), yM: round2(0.3 * floorH), widthM: dock.w, heightM: dock.h, bays: 1 },
  ];
}
