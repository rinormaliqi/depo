import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { alignSnap, avoidObstacles, bayLayout, buildParametric, buildTemplate, clampToFloor, DEFAULT_PARAMETRIC, flip, intersects, isRotation, outsideFloor, pillarGridPositions, rotateBox, snapToWall, turnClockwise } from "./blueprint-types";

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

describe("flow templates", () => {
  it("I-flow: inbound docks and staging on the left, dispatch on the right, storage between, nothing on a dock", () => {
    const specs = buildTemplate("flowI", 40, 24);
    const docks = specs.filter((s) => s.kind === "dock");
    assert.equal(docks.length, 6);
    assert.ok(docks.some((d) => d.xM < 1) && docks.some((d) => d.xM > 36));
    const zones = specs.filter((s) => s.kind === "zone");
    const receiving = zones.find((z) => z.name === "RECEIVING")!;
    const dispatch = zones.find((z) => z.name === "DISPATCH")!;
    assert.ok(receiving.xM < dispatch.xM);
    assert.ok(zones.some((z) => z.name === "OFFICE"));
    assert.equal(specs.filter((s) => s.kind === "door").length, 1);
    const racks = specs.filter((s) => s.kind === "rack");
    assert.ok(racks.length >= 3);
    for (const r of racks) {
      assert.ok(r.xM > receiving.xM + receiving.widthM && r.xM + r.widthM < dispatch.xM, "racks sit between the staging zones");
      for (const d of docks) assert.equal(intersects(r, d, 0.3), false);
    }
  });

  it("U-flow: all docks on the bottom wall, two staging zones above them, storage columns, office top-right", () => {
    const specs = buildTemplate("flowU", 40, 24);
    const docks = specs.filter((s) => s.kind === "dock");
    assert.ok(docks.length >= 2 && docks.every((d) => d.yM + d.heightM > 23));
    const zones = specs.filter((s) => s.kind === "zone");
    const receiving = zones.find((z) => z.name === "RECEIVING")!;
    const dispatch = zones.find((z) => z.name === "DISPATCH")!;
    assert.ok(receiving.xM < 20 && dispatch.xM > 20 && receiving.yM === dispatch.yM);
    const office = zones.find((z) => z.name === "OFFICE")!;
    assert.ok(office.xM > 30 && office.yM < 2);
    for (const r of specs.filter((s) => s.kind === "rack")) assert.ok(r.yM + r.heightM < receiving.yM, "storage stays above the staging");
  });

  it("blank draws nothing; labels are translatable; walls are left out when the floor has some", () => {
    assert.deepEqual(buildTemplate("blank", 40, 24), []);
    const sq = buildTemplate("flowU", 40, 24, { labels: { receiving: "PRANIM", dispatch: "DËRGESË", office: "ZYRA" } });
    assert.ok(sq.some((s) => s.name === "PRANIM"));
    assert.equal(buildTemplate("flowI", 40, 24, { hasWalls: true }).filter((s) => s.kind === "wall").length, 0);
    assert.equal(buildTemplate("flowI", 40, 24).filter((s) => s.kind === "wall").length, 4);
  });

  it("scales down to a small hall without anything landing outside it", () => {
    for (const key of ["flowI", "flowU"] as const) {
      for (const s of buildTemplate(key, 16, 12)) {
        assert.ok(s.xM >= 0 && s.yM >= 0 && s.xM + s.widthM <= 16 + 1e-6 && s.yM + s.heightM <= 12 + 1e-6, `${key} ${s.kind} ${s.name ?? ""} ${s.xM},${s.yM} ${s.widthM}×${s.heightM}`);
      }
    }
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

it("clampToFloor keeps a box inside the building, size and position together", () => {
  const floor = { widthM: 40, heightM: 24 };

  // A box already inside is left exactly as it is.
  assert.deepEqual(clampToFloor({ xM: 9.21, yM: 7.55, widthM: 5.49, heightM: 1.2 }, floor), { xM: 9.21, yM: 7.55, widthM: 5.49, heightM: 1.2 });

  // The case this exists for: a rack typed as 999 m wide in a 40 m building.
  // It cannot be wider than the floor, and once it fills the floor it has to
  // start at the wall — clamping the size alone would still leave it hanging
  // out of the far end.
  assert.deepEqual(clampToFloor({ xM: 9.21, yM: 7.55, widthM: 999, heightM: 1.2 }, floor), { xM: 0, yM: 7.55, widthM: 40, heightM: 1.2 });

  // Growing a box pushes it back off the edge it would have crossed.
  assert.deepEqual(clampToFloor({ xM: 38, yM: 0, widthM: 6, heightM: 2 }, floor), { xM: 34, yM: 0, widthM: 6, heightM: 2 });

  // Negative coordinates come back to the wall; a sliver keeps a minimum.
  assert.deepEqual(clampToFloor({ xM: -5, yM: -1, widthM: 0.01, heightM: 0.01 }, floor), { xM: 0, yM: 0, widthM: 0.3, heightM: 0.3 });

  // Depth is bounded by the building's depth, not its width.
  assert.deepEqual(clampToFloor({ xM: 0, yM: 0, widthM: 10, heightM: 100 }, floor), { xM: 0, yM: 0, widthM: 10, heightM: 24 });
});

it("outsideFloor spots a box that reaches past the building", () => {
  const floor = { widthM: 40, heightM: 24 };
  assert.equal(outsideFloor({ xM: 0, yM: 0, widthM: 40, heightM: 24 }, floor), false, "exactly filling it is inside");
  assert.equal(outsideFloor({ xM: 9.21, yM: 7.55, widthM: 999, heightM: 1.2 }, floor), true);
  assert.equal(outsideFloor({ xM: 38, yM: 0, widthM: 6, heightM: 2 }, floor), true, "hanging over an edge counts");
});
