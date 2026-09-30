import { freshDatabase } from "@/test-support/setup";
import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { createItem } from "@/app/items/actions";
import { createField, deleteField } from "@/app/items/custom-fields-actions";
import { db } from "@/db";
import { items } from "@/db/schema";
import { getValuesForItems } from "@/lib/custom-fields";
import { addMember, createOrg } from "@/test-support/factories";
import { actAs } from "@/test-support/stubs/auth";

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

async function itemByName(organizationId: string, name: string) {
  const [row] = await db.select().from(items).where(and(eq(items.organizationId, organizationId), eq(items.name, name)));
  return row;
}

// #176: custom field values used to be settable only from the edit form —
// createItem() (the "Shto artikull" form) had no idea they existed. Now it
// writes an item's first custom values in the same transaction as the
// item row itself.
describe("createItem: basic fields and custom fields together", () => {
  let orgId: string;

  before(async () => {
    await freshDatabase();
    const { org } = await createOrg();
    orgId = org.id;
    const manager = await addMember(org.id, "manager");
    actAs(manager);
  });

  test("creates an item with the basic fields, and refuses what it always refused", async () => {
    const missingName = await createItem(undefined, form({ name: "", unitOfMeasure: "pcs" }));
    assert.match(missingName?.error ?? "", /errorRequired/);

    const ok = await createItem(undefined, form({ name: "Cable", unitOfMeasure: "m", sku: "C-1" }));
    assert.ok(ok?.created);
    assert.ok(await itemByName(orgId, "Cable"));

    const dupSku = await createItem(undefined, form({ name: "Cable 2", unitOfMeasure: "m", sku: "C-1" }));
    assert.match(dupSku?.error ?? "", /errorSkuTaken/);
    assert.equal(await itemByName(orgId, "Cable 2"), undefined, "a refused create leaves nothing behind");
  });

  test("an optional custom field's value is saved in the same step as creation", async () => {
    const field = await createField({ label: "Brand", type: "text", required: false });
    assert.ok(field.ok);

    const result = await createItem(undefined, form({ name: "Lamp", unitOfMeasure: "pcs", [`custom_${field.value.id}`]: "Acme" }));
    assert.ok(result?.created);

    const item = await itemByName(orgId, "Lamp");
    const values = await getValuesForItems([item.id]);
    assert.equal(values.get(item.id)?.[field.value.id], "Acme");
  });

  test("a required custom field left blank refuses the whole creation — no orphaned item", async () => {
    const field = await createField({ label: "Serial number", type: "text", required: true });
    assert.ok(field.ok);

    const result = await createItem(undefined, form({ name: "Router", unitOfMeasure: "pcs" }));
    assert.match(result?.error ?? "", /errorFieldRequired/);
    assert.equal(await itemByName(orgId, "Router"), undefined, "the item insert must roll back with the failed custom value");

    const retried = await createItem(undefined, form({ name: "Router", unitOfMeasure: "pcs", [`custom_${field.value.id}`]: "SN-001" }));
    assert.ok(retried?.created);
    assert.ok(await itemByName(orgId, "Router"));

    // Done with the required field — later tests shouldn't have to supply
    // it just to exercise something else.
    await deleteField(field.value.id);
  });

  test("an invalid select value refuses creation the same way", async () => {
    const field = await createField({ label: "Color", type: "select", options: ["Red", "Blue"], required: false });
    assert.ok(field.ok);

    const result = await createItem(undefined, form({ name: "Chair", unitOfMeasure: "pcs", [`custom_${field.value.id}`]: "Purple" }));
    assert.match(result?.error ?? "", /errorInvalidOption/);
    assert.equal(await itemByName(orgId, "Chair"), undefined);
  });
});
