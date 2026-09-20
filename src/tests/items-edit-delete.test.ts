import { freshDatabase } from "@/test-support/setup";
import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { eq } from "drizzle-orm";
import { deleteItem, getMyItemsWithStock, updateItem } from "@/app/items/actions";
import { db } from "@/db";
import { items, movements, stock } from "@/db/schema";
import { pickStockAt, receiveStockAt } from "@/lib/stock";
import { addMember, createBin, createItem, createOrg } from "@/test-support/factories";
import { actAs } from "@/test-support/stubs/auth";

async function itemById(id: string) {
  const [row] = await db.select().from(items).where(eq(items.id, id));
  return row;
}

const patch = (over: Partial<Parameters<typeof updateItem>[1]> = {}) => ({ name: "Çimento 50kg", unitOfMeasure: "thes", sku: "", category: "", ...over });

// #90: a typo is fixed in place; an item goes only while nothing ever
// happened to it — stock on the floor and movements in the history both
// keep it, and another company's items are out of reach.
describe("items edit and delete", () => {
  let a: Awaited<ReturnType<typeof createOrg>>;
  let manager: Awaited<ReturnType<typeof addMember>>;
  let worker: Awaited<ReturnType<typeof addMember>>;
  let bin: Awaited<ReturnType<typeof createBin>>;
  let cement: Awaited<ReturnType<typeof createItem>>;
  let other: Awaited<ReturnType<typeof createItem>>;
  let foreign: Awaited<ReturnType<typeof createItem>>;

  before(async () => {
    await freshDatabase();
    a = await createOrg();
    manager = await addMember(a.org.id, "manager");
    worker = await addMember(a.org.id, "worker");
    bin = await createBin(a.facility.id, "A-01-1");
    cement = await createItem(a.org.id, "Cimento 50kg");
    other = await createItem(a.org.id, "Hekur");
    await db.update(items).set({ sku: "NDR-2" }).where(eq(items.id, other.id));
    const b = await createOrg();
    foreign = await createItem(b.org.id, "Tjetër");
  });

  test("update: trims, empties become null, and the SKU rule applies", async () => {
    actAs(manager);
    const ok = await updateItem(cement.id, patch({ name: "  Çimento 50kg ", sku: " NDR-1 ", category: "Çimento" }));
    assert.ok(ok.ok);
    const row = await itemById(cement.id);
    assert.deepEqual([row.name, row.unitOfMeasure, row.sku, row.category], ["Çimento 50kg", "thes", "NDR-1", "Çimento"]);

    const cleared = await updateItem(cement.id, patch({ sku: "", category: " " }));
    assert.ok(cleared.ok);
    assert.deepEqual([(await itemById(cement.id)).sku, (await itemById(cement.id)).category], [null, null]);

    const taken = await updateItem(cement.id, patch({ sku: "NDR-2" }));
    assert.equal(taken.ok, false);
    assert.match(taken.ok ? "" : taken.error, /errorSkuTaken/);

    const blank = await updateItem(cement.id, patch({ unitOfMeasure: " " }));
    assert.equal(blank.ok, false);
    assert.match(blank.ok ? "" : blank.error, /errorRequired/);
  });

  test("a worker, and another company's manager, can't touch it", async () => {
    actAs(worker);
    assert.equal((await updateItem(cement.id, patch({ name: "X" }))).ok, false);
    assert.equal((await deleteItem(cement.id)).ok, false);
    actAs(manager);
    const foreignEdit = await updateItem(foreign.id, patch({ name: "X" }));
    assert.equal(foreignEdit.ok, false);
    assert.match(foreignEdit.ok ? "" : foreignEdit.error, /errorNotFound/);
    assert.equal((await itemById(foreign.id)).name, "Tjetër");
    assert.equal((await itemById(cement.id)).name, "Çimento 50kg");
  });

  test("delete is refused with stock on the floor, and still refused once it's been picked (history)", async () => {
    actAs(manager);
    await receiveStockAt(a.org.id, manager.id, bin.id, cement.id, 5);
    const list = await getMyItemsWithStock();
    assert.equal(list.find((i) => i.id === cement.id)?.inStock, 5);

    const stocked = await deleteItem(cement.id);
    assert.equal(stocked.ok, false);
    assert.match(stocked.ok ? "" : stocked.error, /errorHasStock/);

    await pickStockAt(a.org.id, manager.id, bin.id, cement.id, 5);
    const moved = await deleteItem(cement.id);
    assert.equal(moved.ok, false);
    assert.match(moved.ok ? "" : moved.error, /errorHasHistory/);
    assert.ok(await itemById(cement.id), "still there");
    assert.equal((await db.select().from(movements).where(eq(movements.itemId, cement.id))).length, 2, "history intact");
  });

  test("an unused item goes, with its emptied stock rows", async () => {
    actAs(manager);
    await db.insert(stock).values({ itemId: other.id, locationId: bin.id, quantity: 0 });
    const result = await deleteItem(other.id);
    assert.ok(result.ok);
    assert.deepEqual(result.value, { name: "Hekur" });
    assert.equal(await itemById(other.id), undefined);
    assert.equal((await db.select().from(stock).where(eq(stock.itemId, other.id))).length, 0);
    assert.ok(await itemById(foreign.id), "the other company's item untouched");
  });
});
