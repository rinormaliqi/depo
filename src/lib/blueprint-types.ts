import type { LocationKind } from "@/db/schema";

export type Spatial = "area" | "store" | "fixture";
export type Box = { xM: number; yM: number; widthM: number; heightM: number };

export const LOCATION_TYPES: Record<
  LocationKind,
  { label: string; spatial: Spatial; w: number; h: number; bays: number; levels: number }
> = {
  zone: { label: "Zone", spatial: "area", w: 14, h: 9, bays: 1, levels: 1 },
  aisle: { label: "Aisle", spatial: "area", w: 14, h: 2.4, bays: 1, levels: 1 },
  rack: { label: "Rack", spatial: "store", w: 8, h: 1.2, bays: 8, levels: 1 },
  platform: { label: "Platform", spatial: "store", w: 7.5, h: 4, bays: 4, levels: 1 },
  pallet: { label: "Pallet", spatial: "store", w: 1.4, h: 1.4, bays: 1, levels: 1 },
  bin: { label: "Bin", spatial: "store", w: 1, h: 1, bays: 1, levels: 1 },
  dock: { label: "Dock", spatial: "fixture", w: 3.4, h: 2.6, bays: 1, levels: 1 },
  wall: { label: "Wall", spatial: "fixture", w: 8, h: 0.3, bays: 1, levels: 1 },
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

// A bin's code: level is a height concept (invisible on the top-down floor
// plan, shown one at a time via a level selector) so it's only spelled out
// in the code when there's more than one — a single-level rack keeps the
// simple "A-01-3" form instead of always saying "A-01-1-3".
export function bayCode(parentCode: string, level: number, bay: number, totalLevels: number) {
  return totalLevels > 1 ? `${parentCode}-${level}-${bay}` : `${parentCode}-${bay}`;
}

// ─────────────────────────────────────────────────────────────────────────
// Starter templates
// ─────────────────────────────────────────────────────────────────────────

export interface TemplateEntitySpec {
  kind: LocationKind;
  xM: number;
  yM: number;
  widthM: number;
  heightM: number;
  bays: number;
  levels: number;
}

export const TEMPLATE_KEYS = ["simple", "depotVertical", "depotHorizontal"] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

function racksAlongZone(zone: Box, count: number, levels: number, bays: number, vertical: boolean): TemplateEntitySpec[] {
  const rackDepth = LOCATION_TYPES.rack.h; // real-world depth, never stretched
  if (vertical) {
    // Zone is a tall, narrow strip — racks stack going down its length.
    const widthM = round2(zone.widthM * 0.82);
    const xM = round2(zone.xM + (zone.widthM - widthM) / 2);
    const gap = round2((zone.heightM - count * rackDepth) / (count + 1));
    return Array.from({ length: count }, (_, i) => ({
      kind: "rack" as LocationKind,
      xM,
      yM: round2(zone.yM + gap * (i + 1) + rackDepth * i),
      widthM,
      heightM: rackDepth,
      bays,
      levels,
    }));
  }
  // Zone is a wide, short band — racks sit side by side along its width.
  const widthM = round2((zone.widthM / count) * 0.82);
  const gap = round2((zone.widthM - count * widthM) / (count + 1));
  const yM = round2(zone.yM + (zone.heightM - rackDepth) / 2);
  return Array.from({ length: count }, (_, i) => ({
    kind: "rack" as LocationKind,
    xM: round2(zone.xM + gap * (i + 1) + widthM * i),
    yM,
    widthM,
    heightM: rackDepth,
    bays,
    levels,
  }));
}

function perimeterWalls(floorW: number, floorH: number): TemplateEntitySpec[] {
  const t = LOCATION_TYPES.wall.h; // wall thickness
  const common = { kind: "wall" as LocationKind, bays: 1, levels: 1 };
  return [
    { ...common, xM: 0, yM: 0, widthM: floorW, heightM: t },
    { ...common, xM: 0, yM: round2(floorH - t), widthM: floorW, heightM: t },
    { ...common, xM: 0, yM: 0, widthM: t, heightM: floorH },
    { ...common, xM: round2(floorW - t), yM: 0, widthM: t, heightM: floorH },
  ];
}

// 4 zones, walled perimeter, aisles between zones, 3 racks per zone with
// 2-level pallet racking — a filled-out depot to land on, not a sparse demo.
// Positions scale with the facility's actual floor size; rack depth and
// wall thickness stay at their real-world defaults.
function buildDepot(floorW: number, floorH: number, orientation: "vertical" | "horizontal"): TemplateEntitySpec[] {
  const margin = Math.max(0.6, round2(Math.min(floorW, floorH) * 0.03));
  const aisleW = Math.max(1.2, round2(Math.min(floorW, floorH) * 0.05));
  const zoneCount = 4;
  const racksPerZone = 3;

  const specs: TemplateEntitySpec[] = [...perimeterWalls(floorW, floorH)];

  if (orientation === "vertical") {
    const usableW = floorW - 2 * margin - (zoneCount - 1) * aisleW;
    const zoneW = round2(usableW / zoneCount);
    const zoneH = round2(floorH - 2 * margin);
    for (let i = 0; i < zoneCount; i++) {
      const xM = round2(margin + i * (zoneW + aisleW));
      const zone: Box = { xM, yM: margin, widthM: zoneW, heightM: zoneH };
      specs.push({ kind: "zone", ...zone, bays: 1, levels: 1 });
      specs.push(...racksAlongZone(zone, racksPerZone, 2, 6, true));
      if (i < zoneCount - 1) {
        specs.push({ kind: "aisle", xM: round2(xM + zoneW), yM: margin, widthM: aisleW, heightM: zoneH, bays: 1, levels: 1 });
      }
    }
  } else {
    const usableH = floorH - 2 * margin - (zoneCount - 1) * aisleW;
    const zoneH = round2(usableH / zoneCount);
    const zoneW = round2(floorW - 2 * margin);
    for (let i = 0; i < zoneCount; i++) {
      const yM = round2(margin + i * (zoneH + aisleW));
      const zone: Box = { xM: margin, yM, widthM: zoneW, heightM: zoneH };
      specs.push({ kind: "zone", ...zone, bays: 1, levels: 1 });
      specs.push(...racksAlongZone(zone, racksPerZone, 2, 6, false));
      if (i < zoneCount - 1) {
        specs.push({ kind: "aisle", xM: margin, yM: round2(yM + zoneH), widthM: zoneW, heightM: aisleW, bays: 1, levels: 1 });
      }
    }
  }

  return specs;
}

// Positions/sizes are fractions of the facility's actual width/height, so a
// template fits whatever floor envelope the user already set up — except a
// "store" kind's depth (height), which stays at its real-world default
// rather than stretching with the floor. Entities are ordered zones-first so
// each subsequent "store" entity's centre already falls inside its intended
// zone, letting the normal containment/code-generation logic in
// createEntityAt just work.
export function buildTemplate(key: TemplateKey, floorW: number, floorH: number): TemplateEntitySpec[] {
  if (key === "depotVertical") return buildDepot(floorW, floorH, "vertical");
  if (key === "depotHorizontal") return buildDepot(floorW, floorH, "horizontal");

  const rackH = LOCATION_TYPES.rack.h;
  const zone = { xM: round2(0.05 * floorW), yM: round2(0.08 * floorH), widthM: round2(0.9 * floorW), heightM: round2(0.84 * floorH) };
  const rackW = round2(0.35 * floorW);
  const rackX = round2(zone.xM + 0.08 * floorW);
  const gapY = Math.max(0.6, round2(0.1 * floorH));
  return [
    { kind: "zone", ...zone, bays: 1, levels: 1 },
    { kind: "rack", xM: rackX, yM: round2(zone.yM + gapY), widthM: rackW, heightM: rackH, bays: 6, levels: 1 },
    { kind: "rack", xM: rackX, yM: round2(zone.yM + gapY * 2 + rackH), widthM: rackW, heightM: rackH, bays: 6, levels: 1 },
  ];
}

// ─────────────────────────────────────────────────────────────────────────
// "Add sector" — reflow existing top-level zones to make room for one more,
// rescaling only along whichever axis they're currently laid out on. Aisles
// and other fixtures placed independently of a zone are left untouched —
// this reflows zones and their own direct contents, not the whole floor.
// ─────────────────────────────────────────────────────────────────────────

export function detectOrientation(zones: Box[]): "vertical" | "horizontal" {
  if (zones.length === 0) return "vertical";
  const xs = zones.map((z) => z.xM + z.widthM / 2);
  const ys = zones.map((z) => z.yM + z.heightM / 2);
  const spread = (arr: number[]) => Math.max(...arr) - Math.min(...arr);
  return spread(xs) >= spread(ys) ? "vertical" : "horizontal";
}

export function computeZoneSlots(
  existingCount: number,
  floorW: number,
  floorH: number,
  orientation: "vertical" | "horizontal",
): Box[] {
  const margin = Math.max(0.6, round2(Math.min(floorW, floorH) * 0.03));
  const aisleW = Math.max(1.2, round2(Math.min(floorW, floorH) * 0.05));
  const n = existingCount + 1;

  if (orientation === "vertical") {
    const usableW = floorW - 2 * margin - (n - 1) * aisleW;
    const widthM = round2(Math.max(0.5, usableW / n));
    const heightM = round2(floorH - 2 * margin);
    return Array.from({ length: n }, (_, i) => ({
      xM: round2(margin + i * (widthM + aisleW)),
      yM: margin,
      widthM,
      heightM,
    }));
  }
  const usableH = floorH - 2 * margin - (n - 1) * aisleW;
  const heightM = round2(Math.max(0.5, usableH / n));
  const widthM = round2(floorW - 2 * margin);
  return Array.from({ length: n }, (_, i) => ({
    xM: margin,
    yM: round2(margin + i * (heightM + aisleW)),
    widthM,
    heightM,
  }));
}

// Rescales a box that sits inside `oldZone` to the equivalent relative
// position/size inside `newZone` — a simple affine transform, used to keep a
// zone's racks lining up with it after the zone itself is resized.
export function rescaleWithinZone(child: Box, oldZone: Box, newZone: Box): Box {
  const scaleX = oldZone.widthM > 0 ? newZone.widthM / oldZone.widthM : 1;
  const scaleY = oldZone.heightM > 0 ? newZone.heightM / oldZone.heightM : 1;
  return {
    xM: round2(newZone.xM + (child.xM - oldZone.xM) * scaleX),
    yM: round2(newZone.yM + (child.yM - oldZone.yM) * scaleY),
    widthM: round2(child.widthM * scaleX),
    heightM: round2(child.heightM * scaleY),
  };
}
