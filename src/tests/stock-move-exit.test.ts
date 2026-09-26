import { freshDatabase } from "@/test-support/setup";
import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { movements, stock } from "@/db/schema";
import { exitStockAt, moveStockAt, receiveStockAt } from "@/lib/stock";
import { addMember, createBin, createItem, createOrg } from "@/test-support/factories";

// moveStockAt and exitStockAt are the "relocate within the depot" and
// "leaves the depot for good (sold/removed)" primitives that Epic #0 adds
// alongside the existing receive/pick. Each must be atomic (a rejected
// attempt changes nothing) and must record exactly the movement row the
// history/metrics work (Epic #1) will read.
describe("moveStockAt", () => {
  let org: Awaited<ReturnType<typeof createOrg>>;
  let user: Awaited<ReturnType<typeof addMember>>;
  let binA: Awaited<ReturnType<typeof createBin>>;
  let binB: Awaited<ReturnType<typeof createBin>>;
  let item: Awaited<ReturnType<typeof createItem>>;

  async function quantityAt(locationId: string) {
    const [row] = await db.select().from(stock).where(and(eq(stock.itemId, item.id), eq(stock.locationId, locationId)));
    return row?.quantity ?? 0;
  }

  before(async () => {
    await freshDatabase();
    org = await createOrg();
    user = await addMember(org.org.id, "worker");
    binA = await createBin(org.facility.id, "A-01-1");
    binB = await createBin(org.facility.id, "B-01-1");
    item = await createItem(org.org.id);
    await receiveStockAt(org.org.id, user.id, binA.id, item.id, 20);
  });

  test("moves quantity from one bin to another as a single relocate row", async () => {
    await moveStockAt(org.org.id, user.id, binA.id, binB.id, item.id, 12);
    assert.equal(await quantityAt(binA.id), 8);
    assert.equal(await quantityAt(binB.id), 12);

    const [row] = await db
      .select()
      .from(movements)
      .where(and(eq(movements.itemId, item.id), eq(movements.reason, "relocate")));
    assert.equal(row.fromLocationId, binA.id);
    assert.equal(row.toLocationId, binB.id);
    assert.equal(row.quantity, 12);
  });

  test("moving more than is in the source bin is refused and changes nothing", async () => {
    await assert.rejects(moveStockAt(org.org.id, user.id, binA.id, binB.id, item.id, 999), /notEnough/);
    assert.equal(await quantityAt(binA.id), 8);
    assert.equal(await quantityAt(binB.id), 12);
  });

  test("moving to the same bin is refused", async () => {
    await assert.rejects(moveStockAt(org.org.id, user.id, binA.id, binA.id, item.id, 1), /sameLocation/);
  });
});

describe("exitStockAt", () => {
  let org: Awaited<ReturnType<typeof createOrg>>;
  let user: Awaited<ReturnType<typeof addMember>>;
  let bin: Awaited<ReturnType<typeof createBin>>;
  let item: Awaited<ReturnType<typeof createItem>>;

  async function quantityAt() {
    const [row] = await db.select().from(stock).where(and(eq(stock.itemId, item.id), eq(stock.locationId, bin.id)));
    return row?.quantity ?? 0;
  }

  before(async () => {
    await freshDatabase();
    org = await createOrg();
    user = await addMember(org.org.id, "worker");
    bin = await createBin(org.facility.id, "A-01-1");
    item = await createItem(org.org.id);
    await receiveStockAt(org.org.id, user.id, bin.id, item.id, 15);
  });

  test("records a sale as its own reason, distinct from a generic pick", async () => {
    await exitStockAt(org.org.id, user.id, bin.id, item.id, 5, "sale");
    assert.equal(await quantityAt(), 10);

    const [row] = await db
      .select()
      .from(movements)
      .where(and(eq(movements.itemId, item.id), eq(movements.reason, "sale")));
    assert.equal(row.toLocationId, null);
    assert.equal(row.fromLocationId, bin.id);
    assert.equal(row.quantity, 5);
  });

  test("records a permanent removal distinctly from a sale", async () => {
    await exitStockAt(org.org.id, user.id, bin.id, item.id, 3, "remove");
    assert.equal(await quantityAt(), 7);

    const [row] = await db
      .select()
      .from(movements)
      .where(and(eq(movements.itemId, item.id), eq(movements.reason, "remove")));
    assert.equal(row.quantity, 3);
  });

  test("exiting more than is in the bin is refused and changes nothing", async () => {
    await assert.rejects(exitStockAt(org.org.id, user.id, bin.id, item.id, 999, "sale"), /notEnough/);
    assert.equal(await quantityAt(), 7);
  });
});
