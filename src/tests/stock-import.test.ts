import { freshDatabase } from "@/test-support/setup";
import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { commitStockImport, previewStockImport } from "@/app/stock/import/actions";
import { db } from "@/db";
import { facilities, items, movements, stock } from "@/db/schema";
import { addMember, createBin, createItem, createOrg } from "@/test-support/factories";
import { actAs } from "@/test-support/stubs/auth";
import { resetCookies } from "@/test-support/stubs/next-headers";

async function qty(itemId: string, locationId: string) {
  const [row] = await db.select().from(stock).where(and(eq(stock.itemId, itemId), eq(stock.locationId, locationId)));
  return row?.quantity ?? 0;
}

// The inventory count in bulk (#88): rows resolve against the catalogue
// (SKU, then exact name) and the current facility's bins; the preview
// writes nothing, the commit is all-or-nothing and lands as receive
// movements plus stock, on top of what's already there.
describe("stock import", () => {
  let a: Awaited<ReturnType<typeof createOrg>>;
  let manager: Awaited<ReturnType<typeof addMember>>;
  let worker: Awaited<ReturnType<typeof addMember>>;
  let cement: Awaited<ReturnType<typeof createItem>>;
  let cable: Awaited<ReturnType<typeof createItem>>;
  let bin1: Awaited<ReturnType<typeof createBin>>;
  let bin2: Awaited<ReturnType<typeof createBin>>;

  before(async () => {
    await freshDatabase();
    resetCookies();
    a = await createOrg();
    manager = await addMember(a.org.id, "manager");
    worker = await addMember(a.org.id, "worker");
    cement = await createItem(a.org.id, "Çimento 50kg");
    await db.update(items).set({ sku: "NDR-1" }).where(eq(items.id, cement.id));
    cable = await createItem(a.org.id, "Kabllo 3x1.5"); // no SKU: matched by name
    await createItem(a.org.id, "Vida"); // twice → ambiguous by name
    await createItem(a.org.id, "Vida");
    bin1 = await createBin(a.facility.id, "A-01-1");
    bin2 = await createBin(a.facility.id, "A-01-2");
    // A bin in another company's facility with the same code — must not resolve.
    const b = await createOrg();
    await createBin(b.facility.id, "A-01-1");
  });

  test("preview resolves SKU and name, reports what it can't, writes nothing", async () => {
    actAs(manager);
    const text = ["Artikulli;Kutia;Sasia", "NDR-1;a-01-1;40", "Kabllo 3x1.5;A-01-2;1.200", "Vida;A-01-1;3", "NDR-9;A-01-1;5", "NDR-1;Z-99;5", "NDR-1;A-01-2;0"].join("\n");
    const result = await previewStockImport(text);
    assert.ok(result.ok);
    assert.deepEqual(result.value.counts, { rows: 2, bins: 2, units: 1240 });
    assert.deepEqual(
      result.value.errors.map((e) => [e.line, e.code, e.value]),
      [
        [4, "itemAmbiguous", "Vida"],
        [5, "itemUnknown", "NDR-9"],
        [6, "locationUnknown", "Z-99"],
        [7, "quantityInvalid", "0"],
      ],
    );
    assert.deepEqual(result.value.sample, [
      ["NDR-1", "A-01-1", "40"],
      ["Kabllo 3x1.5", "A-01-2", "1200"],
    ]);
    assert.equal(await qty(cement.id, bin1.id), 0, "a preview never writes");
    assert.equal((await db.select().from(movements)).length, 0);
  });

  test("commit refuses on any error and writes nothing", async () => {
    actAs(manager);
    const result = await commitStockImport("NDR-1;A-01-1;40\nNDR-9;A-01-1;5\n");
    assert.equal(result.ok, false);
    assert.match(result.ok ? "" : result.error, /errorFixFirst/);
    assert.equal(await qty(cement.id, bin1.id), 0);
    assert.equal((await db.select().from(movements)).length, 0);
  });

  test("commit: one receive movement per line, stock summed per item × bin, added to what's there", async () => {
    actAs(manager);
    await db.insert(stock).values({ itemId: cement.id, locationId: bin1.id, quantity: 10 });

    const result = await commitStockImport("NDR-1;A-01-1;40\nNDR-1;A-01-1;5\nKabllo 3x1.5;A-01-2;120\n");
    assert.ok(result.ok);
    assert.deepEqual(result.value, { rows: 3, bins: 2 });

    assert.equal(await qty(cement.id, bin1.id), 55, "10 already there + 40 + 5");
    assert.equal(await qty(cable.id, bin2.id), 120);
    const log = await db.select().from(movements).where(eq(movements.organizationId, a.org.id));
    assert.equal(log.length, 3);
    assert.ok(log.every((m) => m.reason === "receive" && m.fromLocationId === null && m.performedBy === manager.id));
  });

  test("bins are looked up in the facility the user is in, not by code alone", async () => {
    actAs(manager);
    const [other] = await db.insert(facilities).values({ organizationId: a.org.id, name: "Second" }).returning();
    const { rememberFacility } = await import("@/lib/facilities");
    await rememberFacility(other.id);
    const result = await previewStockImport("NDR-1;A-01-1;1\n");
    assert.ok(result.ok);
    assert.deepEqual(result.value.errors.map((e) => e.code), ["locationUnknown"]);
    resetCookies();
  });

  test("a worker can't bulk-import", async () => {
    actAs(worker);
    const result = await commitStockImport("NDR-1;A-01-1;1\n");
    assert.equal(result.ok, false);
    assert.equal(await qty(cement.id, bin1.id), 55);
  });
});
