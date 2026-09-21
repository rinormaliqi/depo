import type { CSSProperties } from "react";
import type { LocationKind } from "@/db/schema";

// The colour each kind owns (tokens in src/app/ds.css). Everything that
// draws a kind — its box, its label, the palette swatch, the legend, the
// landing-page demo — derives from this one table so a kind can't look
// one way on the floor and another in the legend.
export const KIND_COLOR: Record<LocationKind, string> = {
  zone: "var(--kind-zone)",
  aisle: "var(--kind-aisle)",
  rack: "var(--kind-rack)",
  platform: "var(--kind-platform)",
  pallet: "var(--kind-pallet)",
  bin: "var(--kind-bin)",
  dock: "var(--kind-dock)",
  wall: "var(--kind-wall)",
};

// A tint / shade of a kind's colour, so patterns and fills stay in family.
export function kindTint(kind: LocationKind, pct: number) {
  return `color-mix(in srgb,${KIND_COLOR[kind]} ${pct}%,#fff)`;
}
export function kindShade(kind: LocationKind, pct: number) {
  return `color-mix(in srgb,${KIND_COLOR[kind]} ${pct}%,var(--color-text))`;
}
export function kindAlpha(kind: LocationKind, pct: number) {
  return `color-mix(in srgb,${KIND_COLOR[kind]} ${pct}%,transparent)`;
}

// The colour a kind's on-canvas label is set in: dark enough to read on
// white, still recognisably the kind's own.
export function kindLabelColor(kind: LocationKind) {
  return kindShade(kind, 75);
}

// A distinct look per kind, styled after architectural drafting conventions
// (different hatch/fill per material or fixture type, solid poché for
// walls) in the kind's own colour — so the floor plan reads as an actual
// depot layout, not an undifferentiated grid of rectangles. Shared between
// the palette swatches, the legend and the canvas.
export const KIND_APPEARANCE: Record<LocationKind, CSSProperties> = {
  zone: {
    border: `1px dashed ${KIND_COLOR.zone}`,
    background: "transparent",
  },
  aisle: {
    border: `1px dashed ${KIND_COLOR.aisle}`,
    background: `repeating-linear-gradient(45deg,transparent 0 7px,${kindAlpha("aisle", 22)} 7px 8px)`,
  },
  // Shelving frame: a light tint with heavy end-posts (the vertical steel
  // uprights a real pallet rack is bolted to), thin top/bottom rails.
  rack: {
    borderTop: `1px solid ${KIND_COLOR.rack}`,
    borderBottom: `1px solid ${KIND_COLOR.rack}`,
    borderLeft: `4px solid ${KIND_COLOR.rack}`,
    borderRight: `4px solid ${KIND_COLOR.rack}`,
    background: kindTint("rack", 9),
  },
  // Raised deck: a fine crosshatch suggesting a grated/plated platform
  // surface, distinct from a rack's solid shelf tint.
  platform: {
    border: `1px solid ${KIND_COLOR.platform}`,
    background:
      `repeating-linear-gradient(0deg,transparent 0 5px,${kindAlpha("platform", 18)} 5px 6px),` +
      `repeating-linear-gradient(90deg,transparent 0 5px,${kindAlpha("platform", 18)} 5px 6px),` +
      kindTint("platform", 5),
  },
  // Three deck boards, top-down — the classic pallet silhouette, in timber.
  pallet: {
    border: `1px solid ${KIND_COLOR.pallet}`,
    backgroundColor: kindTint("pallet", 10),
    backgroundImage: `linear-gradient(${kindTint("pallet", 55)} 0 18%,transparent 18% 41%,${kindTint("pallet", 55)} 41% 59%,transparent 59% 82%,${kindTint("pallet", 55)} 82% 100%)`,
  },
  // A small container: a nested inset border, like a tote sitting in its slot.
  bin: {
    border: `1px solid ${KIND_COLOR.bin}`,
    background: "#fff",
    boxShadow: `inset 0 0 0 3px var(--color-bg), inset 0 0 0 4px ${kindTint("bin", 55)}`,
  },
  // Fixture, orange hatch — a loading door, not a structural wall.
  dock: {
    border: `1px solid ${KIND_COLOR.dock}`,
    background:
      `repeating-linear-gradient(-45deg,transparent 0 5px,${kindAlpha("dock", 35)} 5px 6px),` + kindTint("dock", 8),
  },
  // Structural walls are drawn solid (poché), same as on a real blueprint —
  // the one kind that's genuinely impassable, so it reads as solid, not hollow.
  wall: {
    border: `1px solid ${KIND_COLOR.wall}`,
    background: KIND_COLOR.wall,
  },
};
