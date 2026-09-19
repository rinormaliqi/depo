import { freshDatabase } from "@/test-support/setup";
import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { eq } from "drizzle-orm";
import { addLevel, removeTopLevel } from "@/app/builder/actions";
import { db } from "@/db";
import { facilityLevels, locations, stock } from "@/db/schema";
import { ensureLevels, renameLevel } from "@/lib/levels";
import { unwrap } from "@/lib/action-result";
import { addMember, createItem, createOrg, seedPlans } from "@/test-support/factories";
import { actAs } from "@/test-support/stubs/auth";

const addLevelU = unwrap(addLevel);
const removeTopLevelU = unwrap(removeTopLevel);

describe("facility levels", () => {
  before(async () => {
    await freshDatabase();
    await seedPlans();
  });

  test("a facility without level rows gets the default two — or as many as its tallest rack — on first read", async () => {
    const { facility } = await createOrg();
    assert.deepEqual((await ensureLevels(facility.id)).map((l) => l.index), [1, 2]);

    const { facility: tall } = await createOrg();
    await db.insert(locations).values({ facilityId: tall.id, kind: "rack", name: "R", code: "A-01", bays: 2, levels: 3 });
    assert.deepEqual((await ensureLevels(tall.id)).map((l) => l.index), [1, 2, 3], "backfill keeps a 3-level rack's third level");
  });

  test("adding a level can extend every rack at the top; removing the top level shrinks them and is blocked by stock", async () => {
    const { org, facility } = await createOrg();
    const admin = await addMember(org.id, "admin");
    actAs(admin);
    // A two-level, two-bay rack drawn the way the builder does it.
    const [rack] = await db.insert(locations).values({ facilityId: facility.id, kind: "rack", name: "R", code: "A-01", bays: 2, levels: 2 }).returning();
    for (const level of [1, 2]) for (const bay of [1, 2]) {
      await db.insert(locations).values({ facilityId: facility.id, parentId: rack.id, kind: "bin", name: `A-01-${level}-${bay}`, code: `A-01-${level}-${bay}`, isBin: true, level, bay });
    }

    await addLevelU(facility.id, true);
    assert.deepEqual((await ensureLevels(facility.id)).map((l) => l.index), [1, 2, 3]);
    const [grown] = await db.select().from(locations).where(eq(locations.id, rack.id));
    assert.equal(grown.levels, 3);
    const bins = await db.select().from(locations).where(eq(locations.parentId, rack.id));
    assert.equal(bins.length, 6, "one new bin per bay on the new level");
    assert.ok(bins.some((b) => b.code === "A-01-3-2"));

    await renameLevel(facility.id, (await ensureLevels(facility.id))[2].id, "Mezanina");
    assert.equal((await ensureLevels(facility.id))[2].name, "Mezanina");

    // Stock on the top level blocks removal, with the bin named.
    const item = await createItem(org.id);
    const top = bins.find((b) => b.code === "A-01-3-1")!;
    await db.insert(stock).values({ itemId: item.id, locationId: top.id, quantity: 4 });
    await assert.rejects(removeTopLevelU(facility.id), /levels\.errorStock/);
    await db.delete(stock).where(eq(stock.locationId, top.id));

    await removeTopLevelU(facility.id);
    assert.deepEqual((await ensureLevels(facility.id)).map((l) => l.index), [1, 2]);
    const [shrunk] = await db.select().from(locations).where(eq(locations.id, rack.id));
    assert.equal(shrunk.levels, 2);
    assert.equal((await db.select().from(locations).where(eq(locations.parentId, rack.id))).length, 4);
    assert.equal((await db.select().from(facilityLevels).where(eq(facilityLevels.facilityId, facility.id))).length, 2);
  });

  test("the last level cannot be removed", async () => {
    const { org, facility } = await createOrg();
    actAs(await addMember(org.id, "admin"));
    await removeTopLevelU(facility.id);
    await assert.rejects(removeTopLevelU(facility.id), /levels\.errorLast/);
  });
});
