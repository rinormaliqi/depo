import { freshDatabase } from "@/test-support/setup";
import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { movements, stock } from "@/db/schema";
import { pickStockAt, receiveStockAt } from "@/lib/stock";
import { addMember, createBin, createItem, createOrg } from "@/test-support/factories";

// movements is the append-only source of truth and stock is the derived
// "current quantity" (docs/architecture.md, "Stock model"). After any
// sequence of receives and picks the two must agree, and a pick that
// would go negative must change nothing.
describe("stock arithmetic", () => {
  let org: Awaited<ReturnType<typeof createOrg>>;
  let user: Awaited<ReturnType<typeof addMember>>;
  let bin: Awaited<ReturnType<typeof createBin>>;
  let item: Awaited<ReturnType<typeof createItem>>;

  async function currentQuantity() {
    const [row] = await db.select().from(stock).where(and(eq(stock.itemId, item.id), eq(stock.locationId, bin.id)));
    return row?.quantity ?? 0;
  }

  async function sumOfMovements() {
    const [{ total }] = await db
      .select({
        total: sql<number>`coalesce(sum(case when ${movements.toLocationId} = ${bin.id} then ${movements.quantity} else -${movements.quantity} end), 0)::int`,
      })
      .from(movements)
      .where(eq(movements.itemId, item.id));
    return total;
  }

  before(async () => {
    await freshDatabase();
    org = await createOrg();
    user = await addMember(org.org.id, "worker");
    bin = await createBin(org.facility.id, "A-01-1");
    item = await createItem(org.org.id);
  });

  test("receive / pick sequence leaves stock equal to the sum of movements", async () => {
    await receiveStockAt(org.org.id, user.id, bin.id, item.id, 25);
    await receiveStockAt(org.org.id, user.id, bin.id, item.id, 10);
    await pickStockAt(org.org.id, user.id, bin.id, item.id, 7);
    await pickStockAt(org.org.id, user.id, bin.id, item.id, 3);
    assert.equal(await currentQuantity(), 25);
    assert.equal(await sumOfMovements(), 25);
    const log = await db.select().from(movements).where(eq(movements.itemId, item.id));
    assert.deepEqual(log.map((m) => m.reason), ["receive", "receive", "pick", "pick"]);
  });

  test("picking more than is there is refused and records nothing", async () => {
    await assert.rejects(pickStockAt(org.org.id, user.id, bin.id, item.id, 26), /notEnough/);
    assert.equal(await currentQuantity(), 25);
    assert.equal(await sumOfMovements(), 25);
  });

  test("zero and negative quantities are refused on both paths", async () => {
    await assert.rejects(receiveStockAt(org.org.id, user.id, bin.id, item.id, 0), /quantity/);
    await assert.rejects(pickStockAt(org.org.id, user.id, bin.id, item.id, -1), /quantity/);
    assert.equal(await sumOfMovements(), 25);
  });

  test("a locked org cannot move stock at all", async () => {
    const locked = await createOrg({ status: "trialing", trialEndsAt: new Date(Date.now() - 1000) });
    const w = await addMember(locked.org.id, "worker");
    const lb = await createBin(locked.facility.id, "L-01-1");
    const li = await createItem(locked.org.id);
    await assert.rejects(receiveStockAt(locked.org.id, w.id, lb.id, li.id, 1), /orgLocked\.trialEnded/);
  });
});
