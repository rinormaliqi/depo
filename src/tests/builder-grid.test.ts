import { freshDatabase } from "@/test-support/setup";
import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { asc, eq } from "drizzle-orm";
import { updateEntity } from "@/app/builder/actions";
import { ownerDb as db } from "@/test-support/owner-db";
import { locations } from "@/db/schema";
import { unwrap } from "@/lib/action-result";
import { addMember, createOrg, seedPlans } from "@/test-support/factories";
import { actAs } from "@/test-support/stubs/auth";

const update = unwrap(updateEntity);

// A rack's bins are rebuilt by reshapeGrid, which used to take the
// facility id from the bins already there. Shrinking a rack to a single
// bay and level removes them all, so growing it again had no facility id
// to give the new bins and failed on the not-null constraint.
describe("a rack's grid can shrink to one cell and grow back", () => {
  before(async () => {
    await freshDatabase();
    await seedPlans();
  });

  test("1×1 back to 3 bays rebuilds the bins in the rack's facility", async () => {
    const { org, facility } = await createOrg();
    actAs(await addMember(org.id, "admin"));
    const [rack] = await db
      .insert(locations)
      .values({ facilityId: facility.id, kind: "rack", name: "R", code: "R-01", xM: 1, yM: 1, widthM: 6, heightM: 1.2, bays: 3, levels: 1 })
      .returning();
    const bins = () => db.select().from(locations).where(eq(locations.parentId, rack.id)).orderBy(asc(locations.code));

    await update(rack.id, { bays: 1 });
    assert.equal((await bins()).length, 0, "a single cell is the rack itself, no child bins");

    await update(rack.id, { bays: 3 });
    const grown = await bins();
    assert.deepEqual(grown.map((b) => b.code), ["R-01-1", "R-01-2", "R-01-3"]);
    assert.ok(grown.every((b) => b.facilityId === facility.id));
    const [saved] = await db.select().from(locations).where(eq(locations.id, rack.id));
    assert.equal(saved.isBin, false, "a rack with bins is no longer a bin itself");
  });
});
