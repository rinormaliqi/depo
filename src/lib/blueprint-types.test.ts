import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { alignSnap, avoidObstacles, bayLayout, buildParametric, buildTemplate, DEFAULT_PARAMETRIC, flip, intersects, isRotation, pillarGridPositions, rotateBox, snapToWall, turnClockwise } from "./blueprint-types";

describe("rotation", () => {
  it("a quarter turn swaps width and depth about the same centre, on the grid", () => {
    // 8 × 1.2 rack at (4, 6): centre (8, 6.6) → 1.2 × 8 with the same centre.
    const r = rotateBox({ xM: 4, yM: 6, widthM: 8, heightM: 1.2 });
    assert.deepEqual(r, { xM: 7.5, yM: 2.5, widthM: 1.2, heightM: 8 });
  });

  it("never rotates off the floor", () => {
    const r = rotateBox({ xM: 0, yM: 0, widthM: 8, heightM: 1.2 });
    assert.equal(r.xM >= 0 && r.yM >= 0, true);
    assert.deepEqual([r.widthM, r.heightM], [1.2, 8]);
  });

  it("four quarter turns come back round; a flip is two of them", () => {
    assert.equal(turnClockwise(turnClockwise(turnClockwise(turnClockwise(0)))), 0);
    assert.equal(flip(0), 180);
    assert.equal(flip(90), 270);
    assert.equal(flip(flip(90)), 90);
  });

  it("lays bays across for 0/180 and down for 90/270, counting from the far end past a half turn", () => {
    assert.deepEqual(bayLayout(0), { vertical: false, reversed: false });
    assert.deepEqual(bayLayout(90), { vertical: true, reversed: false });
    assert.deepEqual(bayLayout(180), { vertical: false, reversed: true });
    assert.deepEqual(bayLayout(270), { vertical: true, reversed: true });
  });

  it("accepts only the four quarter turns", () => {
    assert.equal(isRotation(270), true);
    assert.equal(isRotation(45), false);
    assert.equal(isRotation(-90), false);
  });
});

describe("pillar grid", () => {
  it("puts columns on offset + n × spacing and never over the far edge", () => {
    const cols = pillarGridPositions({ xM: 0, yM: 0, widthM: 24, heightM: 16 }, { spacingX: 8, spacingY: 8, size: 0.5, offsetX: 8, offsetY: 8 });
    // x centres 8, 16 (24 would sit on the far wall); y centres 8 (16 on the wall).
    assert.deepEqual(cols.map((c) => [c.xM + 0.25, c.yM + 0.25]), [[8, 8], [16, 8]]);
    assert.deepEqual([cols[0].widthM, cols[0].heightM], [0.5, 0.5]);
  });

  it("is relative to the area, so a zone gets its own grid", () => {
    const cols = pillarGridPositions({ xM: 10, yM: 5, widthM: 12, heightM: 6 }, { spacingX: 6, spacingY: 6, size: 0.4, offsetX: 3, offsetY: 3 });
    assert.deepEqual(cols.map((c) => [c.xM + 0.2, c.yM + 0.2]), [[13, 8], [19, 8]]);
  });

  it("refuses a degenerate spacing instead of looping forever", () => {
    assert.deepEqual(pillarGridPositions({ xM: 0, yM: 0, widthM: 24, heightM: 16 }, { spacingX: 0, spacingY: 8, size: 0.5, offsetX: 1, offsetY: 1 }), []);
  });
});

describe("avoidObstacles", () => {
  const rack = { kind: "rack" as const, xM: 2, yM: 5, widthM: 11, heightM: 1.2, bays: 10, levels: 2 };

  it("cuts a rack around a column into two pieces at the same bay pitch", () => {
    const col = { xM: 7, yM: 5.3, widthM: 0.5, heightM: 0.5 };
    const out = avoidObstacles([rack], [col], 0.3);
    assert.equal(out.length, 2);
    const [a, b] = out;
    assert.deepEqual([a.xM, a.widthM, a.bays], [2, 4.7, 4]); // 2 → 6.7
    assert.deepEqual([b.xM, b.widthM, b.bays], [7.8, 5.2, 5]); // 7.8 → 13
    assert.equal(a.levels, 2);
  });

  it("drops a stub too short for two bays rather than leaving it", () => {
    const col = { xM: 3, yM: 5.3, widthM: 0.5, heightM: 0.5 }; // 1 m in: left stub is 0.7 m
    const out = avoidObstacles([rack], [col], 0.3);
    assert.equal(out.length, 1);
    assert.equal(out[0].xM, 3.8);
  });

  it("leaves racks that miss the column, and everything that isn't storage, alone", () => {
    const zone = { kind: "zone" as const, xM: 0, yM: 0, widthM: 24, heightM: 16, bays: 1, levels: 1 };
    const far = { xM: 7, yM: 10, widthM: 0.5, heightM: 0.5 };
    const out = avoidObstacles([zone, rack], [far], 0.3);
    assert.deepEqual(out, [zone, rack]);
  });

  it("splits a vertical rack along its length", () => {
    const tall = { kind: "rack" as const, xM: 5, yM: 1, widthM: 1.2, heightM: 11, bays: 10, levels: 1 };
    const col = { xM: 5.3, yM: 6, widthM: 0.5, heightM: 0.5 };
    const out = avoidObstacles([tall], [col], 0.3);
    assert.deepEqual(out.map((p) => [p.yM, p.heightM, p.bays]), [[1, 4.7, 4], [6.8, 5.2, 5]]);
  });
});

describe("buildTemplate with structure", () => {
  it("keeps its walls out when the floor already has some, and routes around obstacles", () => {
    const plain = buildTemplate("depotVertical", 40, 24);
    const withStructure = buildTemplate("depotVertical", 40, 24, { hasWalls: true, obstacles: [{ xM: 6, yM: 4.2, widthM: 0.5, heightM: 0.5 }] });
    assert.equal(plain.filter((s) => s.kind === "wall").length, 4);
    assert.equal(withStructure.filter((s) => s.kind === "wall").length, 0);
    assert.ok(withStructure.filter((s) => s.kind === "rack").length >= plain.filter((s) => s.kind === "rack").length);
    for (const r of withStructure.filter((s) => s.kind === "rack")) {
      assert.equal(intersects(r, { xM: 6, yM: 4.2, widthM: 0.5, heightM: 0.5 }, 0.3), false);
    }
  });
});

describe("snapToWall", () => {
  const top = { xM: 0, yM: 0, widthM: 24, heightM: 0.3 };
  const left = { xM: 0, yM: 0, widthM: 0.3, heightM: 16 };

  it("a door dropped near a horizontal wall takes its line and thickness", () => {
    const r = snapToWall({ xM: 9.4, yM: 0.4, widthM: 1.2, heightM: 0.3 }, [top, left]);
    assert.deepEqual(r, { box: { xM: 9.4, yM: 0, widthM: 1.2, heightM: 0.3 }, rotation: 0 });
  });

  it("a door dropped near a vertical wall stands up along it", () => {
    const r = snapToWall({ xM: 0.35, yM: 6, widthM: 1.2, heightM: 0.3 }, [top, left]);
    // centre y = 6.15 → door runs 5.55 → 6.75, at the wall's x, wall-thick.
    assert.deepEqual(r, { box: { xM: 0, yM: 5.55, widthM: 0.3, heightM: 1.2 }, rotation: 90 });
  });

  it("slides along the wall so it never overhangs an end", () => {
    const r = snapToWall({ xM: 23.6, yM: 0.2, widthM: 1.2, heightM: 0.3 }, [top]);
    assert.deepEqual(r?.box, { xM: 22.8, yM: 0, widthM: 1.2, heightM: 0.3 });
  });

  it("leaves a free-standing door alone", () => {
    assert.equal(snapToWall({ xM: 10, yM: 8, widthM: 1.2, heightM: 0.3 }, [top, left]), null);
  });

  it("picks the nearer of two walls at a corner", () => {
    const r = snapToWall({ xM: 0.5, yM: 0.1, widthM: 1.2, heightM: 0.3 }, [top, left]);
    assert.equal(r?.rotation, 0);
  });
});

describe("buildParametric", () => {
  const base = { ...DEFAULT_PARAMETRIC };

  it("lays docks along the chosen wall and keeps the zones clear of them", () => {
    const specs = buildParametric({ ...base, docks: { count: 3, wall: "bottom" } }, 40, 24);
    const docks = specs.filter((s) => s.kind === "dock");
    assert.equal(docks.length, 3);
    for (const d of docks) assert.ok(Math.abs(d.yM + d.heightM - (24 - 0.3)) < 1e-6); // set just inside the bottom wall
    const zones = specs.filter((s) => s.kind === "zone");
    assert.equal(zones.length, 4);
    for (const z of zones) assert.ok(z.yM + z.heightM <= docks[0].yM - 1.2 + 1e-9, "zone stops before the staging strip");
  });

  it("puts the entrance on the asked wall, at the asked end, wall-thick", () => {
    const [door] = buildParametric({ ...base, entrance: { wall: "left", at: "start" } }, 40, 24).filter((s) => s.kind === "door");
    assert.deepEqual([door.xM, door.widthM], [0.3, 0.3]);
    assert.ok(door.yM < 12);
    assert.equal(door.heightM, 1.2);
  });

  it("with a column grid, no rack overlaps a column", () => {
    const specs = buildParametric({ ...base, pillars: { spacingX: 8, spacingY: 8, size: 0.5 } }, 40, 24);
    const pillars = specs.filter((s) => s.kind === "pillar");
    assert.ok(pillars.length >= 6);
    for (const r of specs.filter((s) => s.kind === "rack")) {
      for (const c of pillars) assert.equal(intersects(r, c, 0.3), false);
    }
  });

  it("honours zone count, orientation and levels", () => {
    const specs = buildParametric({ ...base, zones: 3, orientation: "horizontal", levels: 3, bays: 8 }, 40, 24);
    const zones = specs.filter((s) => s.kind === "zone");
    assert.equal(zones.length, 3);
    assert.ok(zones.every((z) => z.widthM > z.heightM), "horizontal bands");
    const racks = specs.filter((s) => s.kind === "rack");
    assert.ok(racks.length > 0);
    assert.ok(racks.every((r) => r.levels === 3));
  });

  it("leaves its perimeter out when the floor already has walls", () => {
    assert.equal(buildParametric(base, 40, 24, { hasWalls: true }).filter((s) => s.kind === "wall").length, 0);
    assert.equal(buildParametric({ ...base, walls: false }, 40, 24).filter((s) => s.kind === "wall").length, 0);
  });
});

describe("alignSnap", () => {
  const rack = { xM: 2, yM: 6, widthM: 8, heightM: 1.2 };

  it("moving snaps a near edge onto another object's edge and reports the line", () => {
    const r = alignSnap({ xM: 2.15, yM: 3, widthM: 4, heightM: 1.2 }, [rack], 0.2, "move");
    assert.deepEqual([r.box.xM, r.guides.x], [2, 2]);
    assert.equal(r.guides.y, undefined);
  });

  it("centres count too, and the nearest candidate wins", () => {
    // centre 6.1 vs the rack's centre 6 (d=0.1); left 4.1 vs rack left 2 (too far).
    const r = alignSnap({ xM: 4.1, yM: 3, widthM: 4, heightM: 1.2 }, [rack], 0.2, "move");
    assert.deepEqual([r.box.xM, r.guides.x], [4, 6]);
  });

  it("does nothing outside the threshold", () => {
    const r = alignSnap({ xM: 2.5, yM: 3, widthM: 4, heightM: 1.2 }, [rack], 0.2, "move");
    assert.deepEqual(r, { box: { xM: 2.5, yM: 3, widthM: 4, heightM: 1.2 }, guides: {} });
  });

  it("resizing snaps only the far edges and changes the size, not the position", () => {
    const r = alignSnap({ xM: 2, yM: 3, widthM: 7.9, heightM: 1.2 }, [rack], 0.2, "resize");
    assert.deepEqual([r.box.xM, r.box.widthM, r.guides.x], [2, 8, 10]);
  });
});
