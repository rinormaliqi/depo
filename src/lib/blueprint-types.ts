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
  // Openings are wall-thick by default so they sit flush in a wall segment.
  door: { label: "Door", spatial: "fixture", w: 1.2, h: 0.3, bays: 1, levels: 1 },
  exit: { label: "Exit", spatial: "fixture", w: 1.2, h: 0.3, bays: 1, levels: 1 },
  window: { label: "Window", spatial: "fixture", w: 1.5, h: 0.3, bays: 1, levels: 1 },
  vent: { label: "Vent", spatial: "fixture", w: 0.8, h: 0.8, bays: 1, levels: 1 },
  pillar: { label: "Pillar", spatial: "fixture", w: 0.5, h: 0.5, bays: 1, levels: 1 },
};

const CODE_SUFFIX: Partial<Record<LocationKind, string>> = {
  aisle: "AI",
  platform: "P",
  bin: "B",
  dock: "D",
  wall: "W",
  door: "DR",
  exit: "EX",
  window: "WN",
  vent: "V",
  pillar: "C", // column
};

export const ROTATIONS = [0, 90, 180, 270] as const;
export type Rotation = (typeof ROTATIONS)[number];

export function isRotation(v: number): v is Rotation {
  return (ROTATIONS as readonly number[]).includes(v);
}

// A quarter turn clockwise: the contents turn, and because the stored box is
// always the real footprint, width and height swap around the same centre
// (snapped to the grid, kept on the floor). A rack lying along a wall stands
// up against it without drifting.
export function rotateBox(box: Box, snap = 0.25): Box {
  const cx = box.xM + box.widthM / 2;
  const cy = box.yM + box.heightM / 2;
  const widthM = box.heightM;
  const heightM = box.widthM;
  const q = (v: number) => Math.max(0, Math.round(v / snap) * snap);
  return { xM: round2(q(cx - widthM / 2)), yM: round2(q(cy - heightM / 2)), widthM, heightM };
}

export function turnClockwise(r: Rotation): Rotation {
  return ((r + 90) % 360) as Rotation;
}

// A flip is a half turn: the same footprint, bay 1 at the other end. On a
// top-down plan that is what "mirror" means for a rack — which end you
// start counting from.
export function flip(r: Rotation): Rotation {
  return ((r + 180) % 360) as Rotation;
}

// How a rotation lays out a run of bays: down the box instead of across it
// for a quarter or three-quarter turn, and counted from the far end for a
// half or three-quarter turn (bay 1 sits where the box's left edge went).
export function bayLayout(r: Rotation): { vertical: boolean; reversed: boolean } {
  return { vertical: r === 90 || r === 270, reversed: r === 180 || r === 270 };
}

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
// Smart guides
// ─────────────────────────────────────────────────────────────────────────

// Zone colours a user can pick from: the kind hues plus a few more, all
// dark enough to carry a label. Stored as hex so the map is self-contained.
export const ZONE_COLORS = ["#5980a6", "#14877a", "#2f7a4f", "#b08a2e", "#d9822b", "#c23b2e", "#7b4fb0", "#5d5d60"] as const;

export function isZoneColor(v: string) {
  return /^#[0-9a-f]{6}$/i.test(v);
}

export type Guides = { x?: number; y?: number };

// Figma-style alignment: a box being moved or resized snaps its edges and
// centre to the edges and centres of the other objects when they come
// within `thresholdM`, on top of the plain grid snap — so racks line up
// with each other and with the walls, not just with the 0.25 m grid. Returns
// the adjusted box and the lines that made it snap, for the canvas to draw.
// Moving snaps left/centre/right (and top/centre/bottom) and shifts the
// whole box; resizing only snaps the far edges and changes the size.
export function alignSnap(box: Box, others: Box[], thresholdM: number, mode: "move" | "resize"): { box: Box; guides: Guides } {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const o of others) {
    xs.push(o.xM, o.xM + o.widthM, o.xM + o.widthM / 2);
    ys.push(o.yM, o.yM + o.heightM, o.yM + o.heightM / 2);
  }
  const nearest = (value: number, candidates: number[]) => {
    let best: { c: number; d: number } | null = null;
    for (const c of candidates) {
      const d = Math.abs(c - value);
      if (d <= thresholdM && (!best || d < best.d)) best = { c, d };
    }
    return best;
  };

  const out: Box = { ...box };
  const guides: Guides = {};

  if (mode === "move") {
    const probesX = [box.xM, box.xM + box.widthM / 2, box.xM + box.widthM];
    let bestX: { c: number; d: number; shift: number } | null = null;
    for (const p of probesX) {
      const n = nearest(p, xs);
      if (n && (!bestX || n.d < bestX.d)) bestX = { ...n, shift: n.c - p };
    }
    if (bestX) { out.xM = round2(box.xM + bestX.shift); guides.x = bestX.c; }
    const probesY = [box.yM, box.yM + box.heightM / 2, box.yM + box.heightM];
    let bestY: { c: number; d: number; shift: number } | null = null;
    for (const p of probesY) {
      const n = nearest(p, ys);
      if (n && (!bestY || n.d < bestY.d)) bestY = { ...n, shift: n.c - p };
    }
    if (bestY) { out.yM = round2(box.yM + bestY.shift); guides.y = bestY.c; }
  } else {
    const nx = nearest(box.xM + box.widthM, xs);
    if (nx && nx.c - box.xM >= 0.3) { out.widthM = round2(nx.c - box.xM); guides.x = nx.c; }
    const ny = nearest(box.yM + box.heightM, ys);
    if (ny && ny.c - box.yM >= 0.3) { out.heightM = round2(ny.c - box.yM); guides.y = ny.c; }
  }
  return { box: out, guides };
}

// ─────────────────────────────────────────────────────────────────────────
// Openings sit in walls
// ─────────────────────────────────────────────────────────────────────────

export const OPENING_KINDS: readonly LocationKind[] = ["door", "exit", "window"];

export function isOpening(kind: LocationKind) {
  return OPENING_KINDS.includes(kind);
}

// How close (metres) an opening's centre has to come to a wall to be taken
// as belonging to it. Generous on purpose: dropping a door "roughly on the
// wall" is the whole point.
export const WALL_SNAP_M = 0.6;

// An opening dropped on or near a wall becomes part of it: it turns to run
// along the wall, takes the wall's thickness, and slides so it stays within
// the wall's length. Returns null when no wall is close enough — the
// opening then stays a free box, exactly where it was put. The opening's
// long side is kept as its length whichever way it was turned before.
export function snapToWall(
  box: Box,
  walls: Box[],
  tolerance = WALL_SNAP_M,
): { box: Box; rotation: Rotation } | null {
  const cx = box.xM + box.widthM / 2;
  const cy = box.yM + box.heightM / 2;
  const length = Math.max(box.widthM, box.heightM);
  let best: { wall: Box; dist: number } | null = null;
  for (const wall of walls) {
    const horizontal = wall.widthM >= wall.heightM;
    // Gap between the opening's near edge and the wall's centre line (a door
    // still lying the other way is long across the wall, so its centre is
    // far from the line while its edge already touches it), and whether the
    // centre falls within the wall's run (same tolerance at the ends).
    const halfAcross = horizontal ? box.heightM / 2 : box.widthM / 2;
    const dist = Math.max(0, (horizontal ? Math.abs(cy - (wall.yM + wall.heightM / 2)) : Math.abs(cx - (wall.xM + wall.widthM / 2))) - halfAcross);
    const along = horizontal
      ? cx >= wall.xM - tolerance && cx <= wall.xM + wall.widthM + tolerance
      : cy >= wall.yM - tolerance && cy <= wall.yM + wall.heightM + tolerance;
    if (dist <= tolerance && along && (!best || dist < best.dist)) best = { wall, dist };
  }
  if (!best) return null;
  const { wall } = best;
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));
  if (wall.widthM >= wall.heightM) {
    const len = Math.min(length, wall.widthM);
    return {
      box: { xM: round2(clamp(cx - len / 2, wall.xM, wall.xM + wall.widthM - len)), yM: wall.yM, widthM: round2(len), heightM: wall.heightM },
      rotation: 0,
    };
  }
  const len = Math.min(length, wall.heightM);
  return {
    box: { xM: wall.xM, yM: round2(clamp(cy - len / 2, wall.yM, wall.yM + wall.heightM - len)), widthM: wall.widthM, heightM: round2(len) },
    rotation: 90,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Structural columns
// ─────────────────────────────────────────────────────────────────────────

export function intersects(a: Box, b: Box, clearance = 0) {
  return (
    a.xM < b.xM + b.widthM + clearance &&
    a.xM + a.widthM > b.xM - clearance &&
    a.yM < b.yM + b.heightM + clearance &&
    a.yM + a.heightM > b.yM - clearance
  );
}

export interface PillarGridSpec {
  spacingX: number; // metres between column centres, along x
  spacingY: number;
  size: number; // column side, metres (columns are square)
  offsetX: number; // first column centre, measured from the area's left edge
  offsetY: number;
}

// Real buildings put columns on a regular structural grid, so there are
// 20–60 of them and nobody places them one by one. Centres at offset +
// n × spacing inside `area`, dropping any column that wouldn't fit wholly
// inside it — the perimeter's own columns live inside the wall poché.
export function pillarGridPositions(area: Box, g: PillarGridSpec): Box[] {
  const out: Box[] = [];
  if (g.spacingX < 1 || g.spacingY < 1 || g.size <= 0) return out;
  const half = g.size / 2;
  for (let cy = area.yM + g.offsetY; cy + half <= area.yM + area.heightM + 1e-9; cy += g.spacingY) {
    for (let cx = area.xM + g.offsetX; cx + half <= area.xM + area.widthM + 1e-9; cx += g.spacingX) {
      if (cx - half < area.xM - 1e-9 || cy - half < area.yM - 1e-9) continue;
      out.push({ xM: round2(cx - half), yM: round2(cy - half), widthM: g.size, heightM: g.size });
    }
  }
  return out;
}

// Storage can't sit on a column. A template rack that runs into one is cut
// around it along its long axis, the way a real depot's racking breaks at a
// column line: each surviving piece keeps the original bay pitch (so bays
// stay realistic, not stretched), and pieces too short for two bays are
// dropped rather than left as stubs. Anything that isn't storage — zones,
// aisles, walls — passes through untouched; a column inside a zone is fine.
export function avoidObstacles(
  specs: TemplateEntitySpec[],
  obstacles: Box[],
  clearance = 0.3,
  minLength = 2 * RACK_BAY_WIDTH,
): TemplateEntitySpec[] {
  if (obstacles.length === 0) return specs;
  const out: TemplateEntitySpec[] = [];
  for (const spec of specs) {
    if (LOCATION_TYPES[spec.kind].spatial !== "store") { out.push(spec); continue; }
    const horizontal = spec.widthM >= spec.heightM;
    const pitch = (horizontal ? spec.widthM : spec.heightM) / Math.max(1, spec.bays);
    let pieces: TemplateEntitySpec[] = [spec];
    for (const ob of obstacles) {
      const next: TemplateEntitySpec[] = [];
      for (const piece of pieces) {
        if (!intersects(piece, ob, clearance)) { next.push(piece); continue; }
        if (horizontal) {
          const leftEnd = ob.xM - clearance;
          const rightStart = ob.xM + ob.widthM + clearance;
          if (leftEnd - piece.xM >= minLength) next.push({ ...piece, widthM: round2(leftEnd - piece.xM) });
          const pieceEnd = piece.xM + piece.widthM;
          if (pieceEnd - rightStart >= minLength) next.push({ ...piece, xM: round2(rightStart), widthM: round2(pieceEnd - rightStart) });
        } else {
          const topEnd = ob.yM - clearance;
          const bottomStart = ob.yM + ob.heightM + clearance;
          if (topEnd - piece.yM >= minLength) next.push({ ...piece, heightM: round2(topEnd - piece.yM) });
          const pieceEnd = piece.yM + piece.heightM;
          if (pieceEnd - bottomStart >= minLength) next.push({ ...piece, yM: round2(bottomStart), heightM: round2(pieceEnd - bottomStart) });
        }
      }
      pieces = next;
    }
    for (const piece of pieces) {
      const length = horizontal ? piece.widthM : piece.heightM;
      out.push({ ...piece, bays: Math.max(1, Math.round(length / pitch)) });
    }
  }
  return out;
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

// Realistic picking-aisle clearance between rack rows/columns, and the
// per-bay width a template rack is sized against — both metres. Previously
// this function was handed a fixed row count (3) and stretched whatever
// gap was left over to fill the zone, which on a normal-sized facility left
// racks stranded in a zone many times taller than the racking itself — a
// floor plan with far more open floor than actual storage. Deriving the
// count from these two real-world constants instead means a zone fills
// with as many rows as would realistically fit, and a bigger zone gets
// more racks rather than emptier aisles.
const RACK_ROW_GAP = 1.8;
const RACK_BAY_WIDTH = 1.1;

function racksAlongZone(zone: Box, levels: number, bays: number, vertical: boolean): TemplateEntitySpec[] {
  const rackDepth = LOCATION_TYPES.rack.h; // real-world depth, never stretched
  if (vertical) {
    // Zone is a tall, narrow strip — racks stack going down its length.
    const widthM = round2(zone.widthM * 0.82);
    const xM = round2(zone.xM + (zone.widthM - widthM) / 2);
    const unit = rackDepth + RACK_ROW_GAP;
    const count = Math.max(1, Math.floor((zone.heightM + RACK_ROW_GAP) / unit));
    const used = count * rackDepth + (count - 1) * RACK_ROW_GAP;
    const leading = round2((zone.heightM - used) / 2);
    return Array.from({ length: count }, (_, i) => ({
      kind: "rack" as LocationKind,
      xM,
      yM: round2(zone.yM + leading + i * unit),
      widthM,
      heightM: rackDepth,
      bays,
      levels,
    }));
  }
  // Zone is a wide, short band — racks sit side by side along its width, at
  // a realistic width instead of stretching to fill however wide the band
  // happens to be.
  const widthM = round2(Math.min(zone.widthM * 0.82, bays * RACK_BAY_WIDTH));
  const unit = widthM + RACK_ROW_GAP;
  const count = Math.max(1, Math.floor((zone.widthM + RACK_ROW_GAP) / unit));
  const used = count * widthM + (count - 1) * RACK_ROW_GAP;
  const leading = round2((zone.widthM - used) / 2);
  const yM = round2(zone.yM + (zone.heightM - rackDepth) / 2);
  return Array.from({ length: count }, (_, i) => ({
    kind: "rack" as LocationKind,
    xM: round2(zone.xM + leading + i * unit),
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

// N zones side by side inside `area`, aisles between them, each zone packed
// with as many rows of pallet racking as realistically fit it (see
// racksAlongZone) — a filled-out depot to land on, not a sparse demo. Rack
// depth and wall thickness stay at their real-world defaults; everything
// else scales with the area handed in.
function zonesInArea(
  area: Box,
  orientation: "vertical" | "horizontal",
  zoneCount: number,
  levels: number,
  bays: number,
): TemplateEntitySpec[] {
  const aisleW = Math.max(1.2, round2(Math.min(area.widthM, area.heightM) * 0.05));
  const specs: TemplateEntitySpec[] = [];
  const n = Math.max(1, zoneCount);

  if (orientation === "vertical") {
    const usableW = area.widthM - (n - 1) * aisleW;
    const zoneW = round2(usableW / n);
    for (let i = 0; i < n; i++) {
      const xM = round2(area.xM + i * (zoneW + aisleW));
      const zone: Box = { xM, yM: area.yM, widthM: zoneW, heightM: area.heightM };
      specs.push({ kind: "zone", ...zone, bays: 1, levels: 1 });
      specs.push(...racksAlongZone(zone, levels, bays, true));
      if (i < n - 1) {
        specs.push({ kind: "aisle", xM: round2(xM + zoneW), yM: area.yM, widthM: aisleW, heightM: area.heightM, bays: 1, levels: 1 });
      }
    }
  } else {
    const usableH = area.heightM - (n - 1) * aisleW;
    const zoneH = round2(usableH / n);
    for (let i = 0; i < n; i++) {
      const yM = round2(area.yM + i * (zoneH + aisleW));
      const zone: Box = { xM: area.xM, yM, widthM: area.widthM, heightM: zoneH };
      specs.push({ kind: "zone", ...zone, bays: 1, levels: 1 });
      specs.push(...racksAlongZone(zone, levels, bays, false));
      if (i < n - 1) {
        specs.push({ kind: "aisle", xM: area.xM, yM: round2(yM + zoneH), widthM: area.widthM, heightM: aisleW, bays: 1, levels: 1 });
      }
    }
  }
  return specs;
}

function floorMargin(floorW: number, floorH: number) {
  return Math.max(0.6, round2(Math.min(floorW, floorH) * 0.03));
}

// The fixed starter depots: walled perimeter, 4 zones of two-level, 6-bay racking.
function buildDepot(floorW: number, floorH: number, orientation: "vertical" | "horizontal"): TemplateEntitySpec[] {
  const margin = floorMargin(floorW, floorH);
  const area: Box = { xM: margin, yM: margin, widthM: round2(floorW - 2 * margin), heightM: round2(floorH - 2 * margin) };
  return [...perimeterWalls(floorW, floorH), ...zonesInArea(area, orientation, 4, 2, 6)];
}

// ─────────────────────────────────────────────────────────────────────────
// Parametric layout — the wizard's generator
// ─────────────────────────────────────────────────────────────────────────

export type WallSide = "top" | "bottom" | "left" | "right";

export interface ParametricLayout {
  zones: number;
  orientation: "vertical" | "horizontal";
  levels: number;
  bays: number;
  walls: boolean;
  docks: { count: number; wall: WallSide };
  entrance: { wall: WallSide; at: "start" | "middle" | "end" } | null;
  pillars: { spacingX: number; spacingY: number; size: number } | null;
}

export const DEFAULT_PARAMETRIC: ParametricLayout = {
  zones: 4,
  orientation: "vertical",
  levels: 2,
  bays: 6,
  walls: true,
  docks: { count: 2, wall: "bottom" },
  entrance: { wall: "left", at: "middle" },
  pillars: null,
};

// How deep a dock reaches into the floor, plus the truck-side staging strip
// in front of it that racking must leave clear.
const DOCK_STAGING = 1.2;

// `count` boxes of `size` spread evenly along one wall, set just inside it.
function alongWall(floorW: number, floorH: number, wall: WallSide, count: number, len: number, depth: number, positions?: number[]): Box[] {
  const t = LOCATION_TYPES.wall.h;
  const run = wall === "top" || wall === "bottom" ? floorW : floorH;
  const fractions = positions ?? Array.from({ length: count }, (_, i) => (i + 1) / (count + 1));
  return fractions.map((f) => {
    const along = round2(Math.min(Math.max(t, run * f - len / 2), run - t - len));
    switch (wall) {
      case "top": return { xM: along, yM: t, widthM: len, heightM: depth };
      case "bottom": return { xM: along, yM: round2(floorH - t - depth), widthM: len, heightM: depth };
      case "left": return { xM: t, yM: along, widthM: depth, heightM: len };
      case "right": return { xM: round2(floorW - t - depth), yM: along, widthM: depth, heightM: len };
    }
  });
}

// A whole depot from a handful of answers about the real building: where
// the trucks dock, where people come in, how the roof is held up, how the
// storage should be divided. Structure first, then zones in whatever floor
// is left clear of it, then racks routed around every obstacle — the same
// pipeline a fixed template goes through, just driven by the answers.
export function buildParametric(p: ParametricLayout, floorW: number, floorH: number, opts: TemplateOptions = {}): TemplateEntitySpec[] {
  const t = LOCATION_TYPES.wall.h;
  const structure: TemplateEntitySpec[] = [];
  const fixture = (kind: LocationKind, box: Box): TemplateEntitySpec => ({ kind, ...box, bays: 1, levels: 1 });

  if (p.walls && !opts.hasWalls) structure.push(...perimeterWalls(floorW, floorH));

  const dockDepth = LOCATION_TYPES.dock.h;
  const dockLen = LOCATION_TYPES.dock.w;
  if (p.docks.count > 0) {
    for (const box of alongWall(floorW, floorH, p.docks.wall, p.docks.count, dockLen, dockDepth)) structure.push(fixture("dock", box));
  }

  if (p.entrance) {
    const at = p.entrance.at === "start" ? 0.12 : p.entrance.at === "end" ? 0.88 : 0.5;
    const [box] = alongWall(floorW, floorH, p.entrance.wall, 1, LOCATION_TYPES.door.w, t, [at]);
    structure.push(fixture("door", box));
  }

  if (p.pillars) {
    const grid = pillarGridPositions(
      { xM: 0, yM: 0, widthM: floorW, heightM: floorH },
      { ...p.pillars, offsetX: p.pillars.spacingX, offsetY: p.pillars.spacingY },
    );
    for (const box of grid) structure.push(fixture("pillar", box));
  }

  // Zones fill the floor inside the margin, pulled back from the dock wall
  // by the docks' depth and their staging strip.
  const margin = floorMargin(floorW, floorH);
  const inset = { top: margin, bottom: margin, left: margin, right: margin };
  if (p.docks.count > 0) inset[p.docks.wall] = round2(t + dockDepth + DOCK_STAGING);
  const area: Box = {
    xM: inset.left,
    yM: inset.top,
    widthM: round2(floorW - inset.left - inset.right),
    heightM: round2(floorH - inset.top - inset.bottom),
  };
  const scheme = area.widthM > 2 && area.heightM > 2 ? zonesInArea(area, p.orientation, p.zones, p.levels, p.bays) : [];

  const obstacles: Box[] = [
    ...structure.filter((f) => f.kind !== "wall"),
    ...(opts.obstacles ?? []),
  ];
  return [...structure, ...avoidObstacles(scheme, obstacles)];
}

// Positions/sizes are fractions of the facility's actual width/height, so a
// template fits whatever floor envelope the user already set up — except a
// "store" kind's depth (height), which stays at its real-world default
// rather than stretching with the floor. Entities are ordered zones-first so
// each subsequent "store" entity's centre already falls inside its intended
// zone, letting the normal containment/code-generation logic in
// createEntityAt just work.
export interface TemplateOptions {
  // Building structure already on the floor (columns, docks, doors…): racks
  // are routed around it, and the template's own perimeter walls are left
  // out when walls already exist so it doesn't draw a second set.
  obstacles?: Box[];
  hasWalls?: boolean;
}

export function buildTemplate(key: TemplateKey, floorW: number, floorH: number, opts: TemplateOptions = {}): TemplateEntitySpec[] {
  let specs = buildTemplateSpecs(key, floorW, floorH);
  if (opts.hasWalls) specs = specs.filter((s) => s.kind !== "wall");
  return avoidObstacles(specs, opts.obstacles ?? []);
}

function buildTemplateSpecs(key: TemplateKey, floorW: number, floorH: number): TemplateEntitySpec[] {
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
