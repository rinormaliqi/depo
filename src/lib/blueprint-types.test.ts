import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bayLayout, flip, isRotation, rotateBox, turnClockwise } from "./blueprint-types";

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
