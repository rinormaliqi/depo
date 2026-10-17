import { freshDatabase } from "@/test-support/setup";
import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { eq } from "drizzle-orm";
import { applyParametric, applyTemplate, clearFloor } from "@/app/builder/actions";
import { ownerDb as db } from "@/test-support/owner-db";
import { facilities, locations } from "@/db/schema";
import type { ParametricLayout } from "@/lib/blueprint-types";

import { addMember, createItem, createOrg } from "@/test-support/factories";
import { actAs } from "@/test-support/stubs/auth";
import { resetCookies } from "@/test-support/stubs/next-headers";
import { receiveStockAt } from "@/test-support/in-company";

const LAYOUT: ParametricLayout = {
  zones: 4, orientation: "vertical", levels: 1, bays: 6, walls: true,
  docks: { count: 3, wall: "bottom" }, entrance: null, pillars: null,
};

async function rows(facilityId: string) {
  return db.select().from(locations).where(eq(locations.facilityId, facilityId));
}
function countByKind(list: { kind: string }[]) {
  const c: Record<string, number> = {};
  for (const l of list) c[l.kind] = (c[l.kind] ?? 0) + 1;
  return c;
}

// A template or the wizard used to keep every wall, dock, door and column
// already on the floor — including a previous template's — so replacing a
// 40 × 24 layout with a 100 × 50 one left the old perimeter walls and docks
// inside the new plan. Now the caller chooses, and the default UI choice is
// a clean replace.
describe("replacing a layout", () => {
  let org: Awaited<ReturnType<typeof createOrg>>;
  let admin: Awaited<ReturnType<typeof addMember>>;

  beforeEach(async () => {
    resetCookies();
    await freshDatabase();
    org = await createOrg();
    admin = await addMember(org.org.id, "admin");
    actAs(admin);
  });

  test("a clean replace leaves exactly what the new layout makes on an empty floor", async () => {
    // Reference: the wizard on an empty 100 × 50 floor of its own.
    const [ref] = await db.insert(facilities).values({ organizationId: org.org.id, name: "Ref" }).returning();
    assert.ok((await applyParametric(ref.id, LAYOUT, { widthM: 100, heightM: 50 }, false, false)).ok);
    const expected = countByKind(await rows(ref.id));

    assert.ok((await applyTemplate(org.facility.id, "flowU", false)).ok);
    const res = await applyParametric(org.facility.id, LAYOUT, { widthM: 100, heightM: 50 }, true, false);
    assert.ok(res.ok, JSON.stringify(res));
    assert.deepEqual(countByKind(await rows(org.facility.id)), expected);
  });

  test("keeping the structure keeps those very rows", async () => {
    assert.ok((await applyTemplate(org.facility.id, "flowU", false)).ok);
    const before = (await rows(org.facility.id)).filter((l) => ["wall", "dock", "door", "pillar"].includes(l.kind)).map((l) => l.id).sort();
    assert.ok(before.length > 0);
    assert.ok((await applyTemplate(org.facility.id, "flowI", true, true)).ok);
    const after = new Set((await rows(org.facility.id)).map((l) => l.id));
    for (const id of before) assert.ok(after.has(id), "structure row kept");
  });

  test("a floor with only structure asks before a clean replace, and a refusal doesn't resize it", async () => {
    await db.insert(locations).values({ facilityId: org.facility.id, kind: "wall", name: "WALL", code: "W-1", xM: 0, yM: 0, widthM: 40, heightM: 0.3 });
    const refused = await applyParametric(org.facility.id, LAYOUT, { widthM: 100, heightM: 50 }, false, false);
    assert.equal(refused.ok, false);
    const [f] = await db.select().from(facilities).where(eq(facilities.id, org.facility.id));
    assert.deepEqual([f.widthM, f.heightM], [40, 24], "floor size untouched by a refused apply");
    assert.ok((await applyParametric(org.facility.id, LAYOUT, { widthM: 100, heightM: 50 }, true, false)).ok);
    const [g] = await db.select().from(facilities).where(eq(facilities.id, org.facility.id));
    assert.deepEqual([g.widthM, g.heightM], [100, 50]);
  });
});

describe("clearing the plan", () => {
  let org: Awaited<ReturnType<typeof createOrg>>;
  let admin: Awaited<ReturnType<typeof addMember>>;

  beforeEach(async () => {
    resetCookies();
    await freshDatabase();
    org = await createOrg();
    admin = await addMember(org.org.id, "admin");
    actAs(admin);
    assert.ok((await applyTemplate(org.facility.id, "flowU", false)).ok);
  });

  test("removes every element and keeps the floor", async () => {
    const res = await clearFloor(org.facility.id);
    assert.ok(res.ok);
    assert.equal((await rows(org.facility.id)).length, 0);
    const [f] = await db.select().from(facilities).where(eq(facilities.id, org.facility.id));
    assert.deepEqual([f.widthM, f.heightM], [40, 24]);
  });

  test("is refused while a bin holds stock", async () => {
    const bin = (await rows(org.facility.id)).find((l) => l.isBin)!;
    const item = await createItem(org.org.id);
    await receiveStockAt(org.org.id, admin.id, bin.id, item.id, 5);
    const res = await clearFloor(org.facility.id);
    assert.equal(res.ok, false);
    assert.ok((await rows(org.facility.id)).length > 0);
  });

  test("a worker can't", async () => {
    actAs(await addMember(org.org.id, "worker"));
    assert.equal((await clearFloor(org.facility.id)).ok, false);
    assert.ok((await rows(org.facility.id)).length > 0);
  });
});
