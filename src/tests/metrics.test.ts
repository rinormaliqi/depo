import { freshDatabase } from "@/test-support/setup";
import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { getMetrics } from "@/app/metrics/actions";
import { exitStockAt, moveStockAt, receiveStockAt } from "@/lib/stock";
import { addMember, createBin, createItem, createOrg } from "@/test-support/factories";
import { actAs } from "@/test-support/stubs/auth";
import { resetCookies } from "@/test-support/stubs/next-headers";

// Live stock (accountedSkus/occPct) only ever answers "what's on the floor
// right now" — it can't tell a quiet warehouse from one that moved and sold
// a lot of stock. Epic #1 adds soldUnits/removedUnits/relocatedUnits from
// the movements log so the dashboard can tell those apart.
describe("getMetrics: sold/removed/relocated", () => {
  let org: Awaited<ReturnType<typeof createOrg>>;
  let worker: Awaited<ReturnType<typeof addMember>>;
  let binA: Awaited<ReturnType<typeof createBin>>;
  let binB: Awaited<ReturnType<typeof createBin>>;
  let item: Awaited<ReturnType<typeof createItem>>;

  before(async () => {
    resetCookies();
    await freshDatabase();
    org = await createOrg();
    worker = await addMember(org.org.id, "worker");
    binA = await createBin(org.facility.id, "A-01-1");
    binB = await createBin(org.facility.id, "B-01-1");
    item = await createItem(org.org.id);
    actAs(worker);

    await receiveStockAt(org.org.id, worker.id, binA.id, item.id, 30);
    await moveStockAt(org.org.id, worker.id, binA.id, binB.id, item.id, 10);
    await exitStockAt(org.org.id, worker.id, binA.id, item.id, 5, "sale");
    await exitStockAt(org.org.id, worker.id, binA.id, item.id, 2, "remove");
  });

  test("sold/removed/relocated are counted from the log, not from live stock", async () => {
    const data = await getMetrics();
    assert.ok(data);
    assert.equal(data.kpis.soldUnits, 5);
    assert.equal(data.kpis.removedUnits, 2);
    assert.equal(data.kpis.relocatedUnits, 10);
    // 30 received, 10 relocated (still on the floor, just elsewhere), 5 sold
    // and 2 removed leaves 13 in binA and 10 in binB = 23 currently in the
    // warehouse — accountedSkus counts distinct items with stock, not units.
    assert.equal(data.kpis.accountedSkus, 1);
  });

  test("the movement log surfaces every reason, including exits", async () => {
    const data = await getMetrics();
    assert.ok(data);
    const reasons = data.log.map((m) => m.reason);
    assert.ok(reasons.includes("receive"));
    assert.ok(reasons.includes("relocate"));
    assert.ok(reasons.includes("sale"));
    assert.ok(reasons.includes("remove"));
  });
});
