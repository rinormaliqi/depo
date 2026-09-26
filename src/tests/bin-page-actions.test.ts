import { freshDatabase } from "@/test-support/setup";
import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { stock } from "@/db/schema";
import { exitStock, getBinHistory, getOtherBinCodes, moveStock, receiveStock } from "@/app/builder/bin/[locationId]/actions";
import { addMember, createBin, createItem, createOrg } from "@/test-support/factories";
import { actAs } from "@/test-support/stubs/auth";
import { resetCookies } from "@/test-support/stubs/next-headers";

// The bin page (opened straight from the blueprint or a printed label) is
// Epic #4: a worker should be able to move stock to another bin, record a
// sale, or remove it for good — and see the bin's own history — without
// leaving the page for the scanner.
describe("bin page actions", () => {
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
    await receiveStock(binA.id, item.id, 20);
  });

  test("getOtherBinCodes lists every other bin's code, not this one's", async () => {
    const codes = await getOtherBinCodes(binA.id);
    assert.deepEqual(codes, ["B-01-1"]);
  });

  test("move sends stock from this bin straight to the named destination", async () => {
    const result = await moveStock(binA.id, item.id, 6, "b-01-1");
    assert.ok(result.ok);
    assert.equal(await quantityAt(binA.id), 14);
    assert.equal(await quantityAt(binB.id), 6);
  });

  test("move to an unknown code is refused", async () => {
    const result = await moveStock(binA.id, item.id, 1, "Z-99-9");
    assert.equal(result.ok, false);
  });

  test("sale and remove exit stock with their own reasons", async () => {
    const sold = await exitStock(binA.id, item.id, 2, "sale");
    assert.ok(sold.ok);
    const removed = await exitStock(binA.id, item.id, 1, "remove");
    assert.ok(removed.ok);
    assert.equal(await quantityAt(binA.id), 11);
  });

  test("getBinHistory shows every movement touching this bin, either end", async () => {
    const history = await getBinHistory(binA.id);
    const reasons = history.map((m) => m.reason);
    assert.ok(reasons.includes("receive"));
    assert.ok(reasons.includes("relocate"));
    assert.ok(reasons.includes("sale"));
    assert.ok(reasons.includes("remove"));

    const binHistory = await getBinHistory(binB.id);
    assert.equal(binHistory.length, 1);
    assert.equal(binHistory[0].reason, "relocate");
    assert.equal(binHistory[0].from, "A-01-1");
    assert.equal(binHistory[0].to, "B-01-1");
  });
});
