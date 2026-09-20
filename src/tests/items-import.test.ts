import { freshDatabase } from "@/test-support/setup";
import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { createItem } from "@/app/items/actions";
import { commitItemsImport, previewItemsImport } from "@/app/items/import/actions";
import { db } from "@/db";
import { items } from "@/db/schema";
import { addMember, createOrg } from "@/test-support/factories";
import { actAs } from "@/test-support/stubs/auth";

async function orgItems(organizationId: string) {
  return db.select().from(items).where(eq(items.organizationId, organizationId)).orderBy(items.sku, items.name);
}

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

// The bulk path into the catalogue (#85, #86, #87): preview writes
// nothing, commit is all-or-nothing, SKUs update in place and stay
// unique per company — and never cross into another company's list.
describe("items import", () => {
  let a: Awaited<ReturnType<typeof createOrg>>;
  let b: Awaited<ReturnType<typeof createOrg>>;
  let aManager: Awaited<ReturnType<typeof addMember>>;
  let aWorker: Awaited<ReturnType<typeof addMember>>;
  let bAdmin: Awaited<ReturnType<typeof addMember>>;

  before(async () => {
    await freshDatabase();
    a = await createOrg();
    b = await createOrg();
    aManager = await addMember(a.org.id, "manager");
    aWorker = await addMember(a.org.id, "worker");
    bAdmin = await addMember(b.org.id, "admin");
  });

  test("preview counts and reports without writing anything", async () => {
    actAs(aManager);
    const text = "Emri\tNjësia\tKodi\nÇimento 50kg\tthes\tNDR-1\n\tthes\tNDR-2\nHekur\tm\tNDR-1\n";
    const result = await previewItemsImport(text);
    assert.ok(result.ok);
    assert.deepEqual(result.value.counts, { create: 1, update: 0 });
    assert.deepEqual(
      result.value.errors.map((e) => [e.line, e.code]),
      [
        [3, "nameMissing"],
        [4, "duplicateSku"],
      ],
    );
    assert.equal(result.value.hasHeader, true);
    assert.equal((await orgItems(a.org.id)).length, 0, "a preview never writes");
  });

  test("commit refuses while any line has an error — nothing is written", async () => {
    actAs(aManager);
    const result = await commitItemsImport("Ok;pcs;A-1\n;pcs;A-2\n");
    assert.equal(result.ok, false);
    assert.match(result.ok ? "" : result.error, /errorFixFirst/);
    assert.equal((await orgItems(a.org.id)).length, 0);
  });

  test("commit creates rows, then a second import updates by SKU and adds the rest", async () => {
    actAs(aManager);
    const first = await commitItemsImport("Çimento 50kg;thes;NDR-1;Çimento\nVida 4x40;paketë\nVida 4x40;paketë\n");
    assert.ok(first.ok);
    assert.deepEqual(first.value, { created: 3, updated: 0 });
    assert.equal((await orgItems(a.org.id)).length, 3, "rows without a SKU are never merged");

    const preview = await previewItemsImport("Çimento 50kg (i ri);thes;NDR-1;Çimento\nHekur Ø12;m;NDR-2;Hekur\n");
    assert.ok(preview.ok);
    assert.deepEqual(preview.value.counts, { create: 1, update: 1 });

    const second = await commitItemsImport("Çimento 50kg (i ri);thes;NDR-1;Çimento\nHekur Ø12;m;NDR-2;Hekur\n");
    assert.ok(second.ok);
    assert.deepEqual(second.value, { created: 1, updated: 1 });

    const rows = await orgItems(a.org.id);
    assert.equal(rows.length, 4);
    const cement = rows.find((r) => r.sku === "NDR-1");
    assert.equal(cement?.name, "Çimento 50kg (i ri)", "the existing SKU was renamed in place, not duplicated");
    assert.equal(rows.filter((r) => r.sku === "NDR-1").length, 1);
  });

  test("the same SKU in another company is a separate item, and a worker can't import", async () => {
    actAs(bAdmin);
    const result = await commitItemsImport("Çimento 50kg;thes;NDR-1\n");
    assert.ok(result.ok);
    assert.deepEqual(result.value, { created: 1, updated: 0 });
    assert.equal((await orgItems(b.org.id)).length, 1);
    assert.equal((await orgItems(a.org.id)).length, 4, "company A untouched");

    actAs(aWorker);
    const denied = await commitItemsImport("X;pcs;NDR-9\n");
    assert.equal(denied.ok, false);
    assert.equal((await orgItems(a.org.id)).filter((r) => r.sku === "NDR-9").length, 0);
  });

  test("the single-item form reports a taken SKU instead of a constraint error", async () => {
    actAs(aManager);
    const dup = await createItem(undefined, form({ name: "Tjetër", unitOfMeasure: "pcs", sku: "NDR-1" }));
    assert.match(dup?.error ?? "", /errorSkuTaken/);
    const fresh = await createItem(undefined, form({ name: "Tjetër", unitOfMeasure: "pcs", sku: "NDR-3" }));
    assert.equal(fresh?.error, undefined);
    assert.ok(fresh?.created);
    const [row] = await db.select().from(items).where(and(eq(items.organizationId, a.org.id), eq(items.sku, "NDR-3")));
    assert.equal(row.name, "Tjetër");
  });
});
