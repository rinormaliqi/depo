import { freshDatabase } from "@/test-support/setup";
import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { eq } from "drizzle-orm";
import { GET as exportItems } from "@/app/items/export/route";
import { commitItemsImport } from "@/app/items/import/actions";
import { GET as exportStock } from "@/app/stock/export/route";
import { previewStockImport } from "@/app/stock/import/actions";
import { db } from "@/db";
import { items, stock } from "@/db/schema";
import { tokenize } from "@/lib/import-table";
import { addMember, createBin, createItem, createOrg } from "@/test-support/factories";
import { actAs } from "@/test-support/stubs/auth";
import { resetCookies } from "@/test-support/stubs/next-headers";

async function csvRows(res: Response) {
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /text\/csv/);
  // Response.text() strips the BOM as it decodes; check the raw bytes.
  const bytes = new Uint8Array(await res.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf], "UTF-8 BOM for Excel");
  const text = new TextDecoder().decode(bytes);
  return { text, rows: tokenize(text, ";").map((r) => r.cells) };
}

// The loop closes (#89): what comes out re-imports as-is — the catalogue
// with "0 new, N updated", the floor with no errors — and only for the
// company and facility the caller is in.
describe("CSV export", () => {
  let a: Awaited<ReturnType<typeof createOrg>>;
  let manager: Awaited<ReturnType<typeof addMember>>;
  let worker: Awaited<ReturnType<typeof addMember>>;

  before(async () => {
    await freshDatabase();
    resetCookies();
    a = await createOrg();
    manager = await addMember(a.org.id, "manager");
    worker = await addMember(a.org.id, "worker");
    const cement = await createItem(a.org.id, "Çimento 50kg");
    await db.update(items).set({ sku: "NDR-1", category: "Çimento; thasë" }).where(eq(items.id, cement.id));
    const screws = await createItem(a.org.id, "Vida 4x40"); // no SKU
    const bin1 = await createBin(a.facility.id, "A-01-1");
    const bin2 = await createBin(a.facility.id, "A-01-2");
    await db.insert(stock).values([
      { itemId: cement.id, locationId: bin1.id, quantity: 40 },
      { itemId: screws.id, locationId: bin2.id, quantity: 1200 },
      { itemId: cement.id, locationId: bin2.id, quantity: 0 }, // emptied: not exported
    ]);
    // Another company with stock — must not leak into either file.
    const b = await createOrg();
    const other = await createItem(b.org.id, "Tjetër");
    const otherBin = await createBin(b.facility.id, "A-01-1");
    await db.insert(stock).values({ itemId: other.id, locationId: otherBin.id, quantity: 9 });
  });

  // Before the items re-import below, which adds a second SKU-less "Vida
  // 4x40" and would make that name ambiguous.
  test("stock export: this facility's stocked bins only, and it previews back with no errors", async () => {
    actAs(worker);
    const res = await exportStock();
    assert.match(res.headers.get("content-disposition") ?? "", /stoku-main-\d{4}-\d{2}-\d{2}\.csv/);
    const { text, rows } = await csvRows(res);
    assert.deepEqual(rows, [
      ["item", "name", "location", "quantity", "unit"],
      ["NDR-1", "Çimento 50kg", "A-01-1", "40", "pcs"],
      ["Vida 4x40", "Vida 4x40", "A-01-2", "1200", "pcs"],
    ]);
    actAs(manager);
    const preview = await previewStockImport(text);
    assert.ok(preview.ok);
    assert.deepEqual(preview.value.errors, []);
    assert.deepEqual(preview.value.counts, { rows: 2, bins: 2, units: 1240 });
  });

  test("items export: header + one line per item, quoted where needed, re-imports as all updates", async () => {
    actAs(manager);
    const { text, rows } = await csvRows(await exportItems());
    assert.deepEqual(rows[0], ["name", "unit", "sku", "category"]);
    assert.deepEqual(rows.slice(1).sort(), [
      ["Vida 4x40", "pcs", "", ""],
      ["Çimento 50kg", "pcs", "NDR-1", "Çimento; thasë"],
    ]);
    const back = await commitItemsImport(text);
    assert.ok(back.ok);
    // The SKU line updates in place; the SKU-less line can only be created again.
    assert.deepEqual(back.value, { created: 1, updated: 1 });
  });

  test("items export is for managers and admins only", async () => {
    actAs(worker);
    assert.equal((await exportItems()).status, 403);
  });

  test("signed out gets 403", async () => {
    actAs(null);
    assert.equal((await exportStock()).status, 403);
    assert.equal((await exportItems()).status, 403);
  });
});
