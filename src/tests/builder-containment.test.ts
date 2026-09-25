import { freshDatabase } from "@/test-support/setup";
import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { eq } from "drizzle-orm";
import { updateEntity } from "@/app/builder/actions";
import { db } from "@/db";
import { facilities, locations } from "@/db/schema";
import { unwrap } from "@/lib/action-result";
import { addMember, createOrg, seedPlans } from "@/test-support/factories";
import { actAs } from "@/test-support/stubs/auth";

const update = unwrap(updateEntity);

// The drag path has always clamped what it places; the inspector's number
// fields went straight through. Typing 999 into a 40 m building stored a
// rack that crossed the plan and hung out of the far wall, over its
// neighbours and outside every zone — and with its own bays covering it,
// it could not be selected again to undo.
describe("an entity cannot be typed outside its building", () => {
  before(async () => {
    await freshDatabase();
    await seedPlans();
  });

  async function floor(widthM = 40, heightM = 24) {
    const { org, facility } = await createOrg();
    await db.update(facilities).set({ widthM, heightM }).where(eq(facilities.id, facility.id));
    actAs(await addMember(org.id, "admin"));
    const [rack] = await db
      .insert(locations)
      .values({ facilityId: facility.id, kind: "rack", name: "E-03", code: "E-03", xM: 9.21, yM: 7.55, widthM: 5.49, heightM: 1.2, bays: 6, levels: 2 })
      .returning();
    return { facility, rack };
  }

  const read = async (id: string) => (await db.select().from(locations).where(eq(locations.id, id)))[0];

  test("a width past the far wall is cut to the building, and the box settles inside it", async () => {
    const { rack } = await floor();
    await update(rack.id, { widthM: 999 });
    const saved = await read(rack.id);
    assert.equal(saved.widthM, 40, "no wider than the building");
    assert.equal(saved.xM, 0, "and pulled back to the wall so it still fits");
    assert.equal(saved.heightM, 1.2, "the side that wasn't touched is left alone");
  });

  test("growing a box near an edge moves it back instead of letting it hang over", async () => {
    const { rack } = await floor();
    await update(rack.id, { xM: 38, widthM: 6 });
    const saved = await read(rack.id);
    assert.equal(saved.widthM, 6);
    assert.equal(saved.xM, 34, "34 + 6 = the building's 40");
  });

  test("depth is bounded by the building's depth, not its width", async () => {
    const { rack } = await floor();
    await update(rack.id, { heightM: 100 });
    assert.equal((await read(rack.id)).heightM, 24);
  });

  test("a position outside the building comes back to the wall", async () => {
    const { rack } = await floor();
    await update(rack.id, { xM: 500, yM: 500 });
    const saved = await read(rack.id);
    assert.equal(saved.xM, 40 - 5.49);
    assert.equal(saved.yM, 24 - 1.2);
  });

  test("a box already inside is stored exactly as typed", async () => {
    const { rack } = await floor();
    await update(rack.id, { xM: 3.5, yM: 2.25, widthM: 8, heightM: 1.2 });
    const saved = await read(rack.id);
    assert.deepEqual([saved.xM, saved.yM, saved.widthM, saved.heightM], [3.5, 2.25, 8, 1.2]);
  });

  test("a row stored before this rule can be corrected back", async () => {
    const { rack } = await floor();
    await db.update(locations).set({ widthM: 999 }).where(eq(locations.id, rack.id));
    await update(rack.id, { widthM: 5.49 });
    assert.equal((await read(rack.id)).widthM, 5.49);
  });
});
