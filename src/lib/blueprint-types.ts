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
  const n = existingCodes.filter((c) => c.startsWith(stem)).length + 1;
  return stem + (suf ? String(n) : String(n).padStart(2, "0"));
}

export function bayCode(parentCode: string, bay: number) {
  return `${parentCode}-${bay}`;
}
