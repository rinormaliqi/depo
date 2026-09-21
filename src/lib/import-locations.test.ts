import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { autoLayout, locationsImportTemplate, parseKind, parseLocationsText } from "./import-locations";

describe("parseLocationsText", () => {
  it("reads the template back: zones, racks with and without a position, a platform, a dock", () => {
    const p = parseLocationsText(locationsImportTemplate());
    assert.deepEqual(p.errors, []);
    assert.equal(p.hasHeader, true);
    assert.equal(p.rows.length, 6);
    const a01 = p.rows.find((r) => r.code === "A-01")!;
    assert.deepEqual([a01.kind, a01.parent, a01.bays, a01.levels], ["rack", "A", 8, 2]);
    assert.deepEqual(a01.box, { xM: 2, yM: 2, widthM: 8, heightM: 1.2 });
    const a02 = p.rows.find((r) => r.code === "A-02")!;
    assert.equal(a02.box, null);
    assert.deepEqual([a02.bays, a02.levels], [6, 1]);
  });

  it("accepts Albanian kind names and an Excel paste without a header", () => {
    const p = parseLocationsText("A\tzonë\nA-01\traft\tA\t\t\t\t\t6\t2\n");
    assert.deepEqual(p.errors, []);
    assert.equal(p.hasHeader, false);
    assert.deepEqual(p.rows.map((r) => r.kind), ["zone", "rack"]);
    assert.equal(parseKind("Shtyllë"), "pillar");
    assert.equal(parseKind("nonsense"), null);
  });

  it("reports what it can't use, line by line", () => {
    const p = parseLocationsText([
      "code;kind;parent;x;y;width;depth;bays;levels",
      ";rack;A;;;;;;",            // no code
      "X1;shelfy;;;;;;;",         // unknown kind
      "X2;bin;;;;;;;",            // bins aren't imported
      "X3;rack;;1;2;;;;",         // half a position
      "X4;rack;;1;2;abc;1.2;;",   // bad number
      "X5;rack;;;;;;99;",         // too many bays
      "X6;zone;;;;;;;",
      "X6;zone;;;;;;;",           // duplicate
    ].join("\n"));
    assert.deepEqual(
      p.errors.map((e) => [e.line, e.code]),
      [[2, "codeMissing"], [3, "kindInvalid"], [4, "binNotImportable"], [5, "positionPartial"], [6, "numberInvalid"], [7, "baysInvalid"], [9, "duplicateCode"]],
    );
    assert.deepEqual(p.rows.map((r) => r.code), ["X6"]);
  });

  it("ignores bays/levels on things that don't store", () => {
    const p = parseLocationsText("code;kind;bays;levels\nD1;dock;9;9\n");
    assert.deepEqual([p.rows[0].bays, p.rows[0].levels], [1, 1]);
  });
});

describe("autoLayout", () => {
  it("flows objects left to right and wraps into new rows inside the container", () => {
    const zone = { xM: 1, yM: 1, widthM: 18, heightM: 9 };
    const racks = Array.from({ length: 3 }, (_, i) => ({ kind: "rack" as const, bays: 6, code: `R${i}` }));
    const out = autoLayout(racks, zone);
    // 6 bays → 6.6 m wide; two fit across 18 m with the inset, the third wraps.
    assert.deepEqual(out.map((r) => [r.box.xM, r.box.yM]), [[1.6, 1.6], [9.2, 1.6], [1.6, 4.6]]);
    assert.ok(out.every((r) => r.box.widthM === 6.6 && r.box.heightM === 1.2));
  });
});

describe("autoLayout in a short container", () => {
  it("keeps a wrapped row inside the container instead of off the floor", () => {
    const zone = { xM: 1, yM: 12, widthM: 10, heightM: 3.5 };
    const out = autoLayout([{ kind: "rack" as const, bays: 6 }, { kind: "rack" as const, bays: 4 }], zone);
    for (const r of out) assert.ok(r.box.yM + r.box.heightM <= zone.yM + zone.heightM - 0.6 + 1e-9, `${r.box.yM}`);
  });
});
