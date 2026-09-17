import { freshDatabase } from "@/test-support/setup";
import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { eq } from "drizzle-orm";
import { getFacilityLocations } from "@/app/builder/actions";
import { searchStock } from "@/app/stock/actions";
import { db } from "@/db";
import { stock } from "@/db/schema";
import { pickStockAt, receiveStockAt, requireOwnedBin, requireOwnedItem } from "@/lib/stock";
import { addMember, createBin, createItem, createOrg } from "@/test-support/factories";
import { actAs } from "@/test-support/stubs/auth";

// The multi-tenant promise: everything is scoped by organization_id in
// app code (docs/architecture.md, "Data layer"). Org A must never read or
// write org B's locations, items or stock — through the helpers every
// write path uses, and through the read actions a signed-in user calls.
describe("tenant isolation", () => {
  let a: Awaited<ReturnType<typeof createOrg>>;
  let b: Awaited<ReturnType<typeof createOrg>>;
  let aAdmin: Awaited<ReturnType<typeof addMember>>;
  let aBin: Awaited<ReturnType<typeof createBin>>;
  let bBin: Awaited<ReturnType<typeof createBin>>;
  let aItem: Awaited<ReturnType<typeof createItem>>;
  let bItem: Awaited<ReturnType<typeof createItem>>;

  before(async () => {
    await freshDatabase();
    a = await createOrg();
    b = await createOrg();
    aAdmin = await addMember(a.org.id, "admin");
    const bAdmin = await addMember(b.org.id, "admin");
    aBin = await createBin(a.facility.id, "A-01-1");
    bBin = await createBin(b.facility.id, "B-01-1");
    aItem = await createItem(a.org.id, "Widget A");
    bItem = await createItem(b.org.id, "Widget B");
    await receiveStockAt(b.org.id, bAdmin.id, bBin.id, bItem.id, 40);
  });

  test("ownership helpers reject the other org's bin and item", async () => {
    await assert.rejects(requireOwnedBin(bBin.id, a.org.id), /NotFound/i);
    await assert.rejects(requireOwnedItem(bItem.id, a.org.id), /NotFound/i);
    await assert.doesNotReject(requireOwnedBin(aBin.id, a.org.id));
  });

  test("org A cannot receive or pick stock in org B's bin, nor with org B's item", async () => {
    await assert.rejects(receiveStockAt(a.org.id, aAdmin.id, bBin.id, aItem.id, 1));
    await assert.rejects(receiveStockAt(a.org.id, aAdmin.id, aBin.id, bItem.id, 1));
    await assert.rejects(pickStockAt(a.org.id, aAdmin.id, bBin.id, bItem.id, 1));
    const [bStock] = await db.select().from(stock).where(eq(stock.locationId, bBin.id));
    assert.equal(bStock.quantity, 40, "org B's stock untouched");
  });

  test("a signed-in user of org A cannot list org B's facility locations", async () => {
    actAs(aAdmin);
    await assert.rejects(getFacilityLocations(b.facility.id), /facilityNotFound/);
    const own = await getFacilityLocations(a.facility.id);
    assert.equal(own.length, 1);
  });

  test("stock search as org A never returns org B's stock", async () => {
    actAs(aAdmin);
    const hits = await searchStock("Widget");
    assert.deepEqual(hits.map((h) => h.itemName), []);
    const bAdmin = await addMember(b.org.id, "manager");
    actAs(bAdmin);
    const bHits = await searchStock("Widget");
    assert.deepEqual(bHits.map((h) => h.itemName), ["Widget B"]);
  });
});
