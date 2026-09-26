import { freshDatabase } from "@/test-support/setup";
import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { stock } from "@/db/schema";
import { commitScan, getRecentMovements } from "@/app/scanner/actions";
import { addMember, createBin, createItem, createOrg } from "@/test-support/factories";
import { actAs } from "@/test-support/stubs/auth";
import { resetCookies } from "@/test-support/stubs/next-headers";

// The scanner is the floor worker's only entry point for receive/move/
// sale/remove (Epic #3) — each action must resolve bin codes on this
// facility, write the right movement reason, and show up in the "recent
// movements" feed, which used to only show entries with toLocationId set
// (silently dropping every pick/sale/removal).
describe("scanner commitScan", () => {
  let org: Awaited<ReturnType<typeof createOrg>>;
  let worker: Awaited<ReturnType<typeof addMember>>;
  let binA: Awaited<ReturnType<typeof createBin>>;
  let binB: Awaited<ReturnType<typeof createBin>>;
  let item: Awaited<ReturnType<typeof createItem>>;

  async function quantityAt(locationId: string) {
    const [row] = await db.select().from(stock).where(and(eq(stock.itemId, item.id), eq(stock.locationId, locationId)));
    return row?.quantity ?? 0;
  }

  before(async () => {
    resetCookies();
    await freshDatabase();
    org = await createOrg();
    worker = await addMember(org.org.id, "worker");
    binA = await createBin(org.facility.id, "A-01-1");
    binB = await createBin(org.facility.id, "B-01-1");
    item = await createItem(org.org.id);
    actAs(worker);
  });

  test("receive books stock into the named bin", async () => {
    const result = await commitScan("receive", item.id, 10, "a-01-1");
    assert.ok(result.ok);
    assert.equal(await quantityAt(binA.id), 10);
  });

  test("move sends stock from one bin straight to another", async () => {
    const result = await commitScan("move", item.id, 4, "a-01-1", "b-01-1");
    assert.ok(result.ok);
    assert.equal(await quantityAt(binA.id), 6);
    assert.equal(await quantityAt(binB.id), 4);
  });

  test("move without a destination is refused", async () => {
    const result = await commitScan("move", item.id, 1, "a-01-1", "");
    assert.equal(result.ok, false);
  });

  test("sale removes stock and is refused past what's on hand", async () => {
    const sold = await commitScan("sale", item.id, 3, "a-01-1");
    assert.ok(sold.ok);
    assert.equal(await quantityAt(binA.id), 3);

    const overSold = await commitScan("sale", item.id, 999, "a-01-1");
    assert.equal(overSold.ok, false);
    assert.equal(await quantityAt(binA.id), 3);
  });

  test("remove exits stock with its own reason, distinct from a sale", async () => {
    const removed = await commitScan("remove", item.id, 1, "a-01-1");
    assert.ok(removed.ok);
    assert.equal(await quantityAt(binA.id), 2);
  });

  test("recent movements surfaces every action, including exits that used to be dropped", async () => {
    const recent = await getRecentMovements();
    const reasons = recent.map((m) => m.reason);
    assert.ok(reasons.includes("receive"));
    assert.ok(reasons.includes("relocate"));
    assert.ok(reasons.includes("sale"));
    assert.ok(reasons.includes("remove"));

    const relocate = recent.find((m) => m.reason === "relocate");
    assert.equal(relocate?.from, "A-01-1");
    assert.equal(relocate?.to, "B-01-1");

    const sale = recent.find((m) => m.reason === "sale");
    assert.equal(sale?.from, "A-01-1");
    assert.equal(sale?.to, "—");
  });
});
