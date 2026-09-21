import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calibrateUnderlay } from "./underlay-shared";

describe("calibrateUnderlay", () => {
  // A 1200 px drawing fitted to a 24 m floor: 0.02 m/px, at the origin.
  const meta = { scale: 0.02, offsetXM: 0, offsetYM: 0 };

  it("derives metres per pixel from two points of known distance", () => {
    // Walls at 60 px and 1140 px (1.2 m and 22.8 m on the floor) are really 24 m apart.
    const r = calibrateUnderlay(meta, { x: 1.2, y: 6 }, { x: 22.8, y: 6 }, 24);
    assert.ok(r);
    assert.ok(Math.abs(r.scale - 24 / 1080) < 1e-9);
  });

  it("keeps the first clicked point where it was", () => {
    const a = { x: 1.2, y: 6 };
    const r = calibrateUnderlay(meta, a, { x: 22.8, y: 6 }, 24)!;
    const pxA = { x: a.x / meta.scale, y: a.y / meta.scale };
    assert.ok(Math.abs(r.offsetXM + pxA.x * r.scale - a.x) < 1e-9);
    assert.ok(Math.abs(r.offsetYM + pxA.y * r.scale - a.y) < 1e-9);
  });

  it("refuses two coincident points or a non-positive distance", () => {
    assert.equal(calibrateUnderlay(meta, { x: 5, y: 5 }, { x: 5, y: 5 }, 10), null);
    assert.equal(calibrateUnderlay(meta, { x: 1, y: 1 }, { x: 9, y: 1 }, 0), null);
  });
});
