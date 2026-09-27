import { freshDatabase } from "@/test-support/setup";
import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { createField, deleteField, getMyFieldDefinitions, getMyItemsCustomValues, setItemCustomValues, updateField } from "@/app/items/custom-fields-actions";
import { addMember, createItem, createOrg } from "@/test-support/factories";
import { actAs } from "@/test-support/stubs/auth";
import { resetCookies } from "@/test-support/stubs/next-headers";

// The action layer is where permission and item-ownership checks live —
// the lib functions in src/lib/custom-fields.ts trust their caller, so
// these are what actually stop a worker from redefining the catalog's
// fields or one company from touching another's item.
describe("custom fields server actions", () => {
  let orgA: Awaited<ReturnType<typeof createOrg>>;
  let orgB: Awaited<ReturnType<typeof createOrg>>;
  let manager: Awaited<ReturnType<typeof addMember>>;
  let worker: Awaited<ReturnType<typeof addMember>>;
  let itemA: Awaited<ReturnType<typeof createItem>>;
  let itemB: Awaited<ReturnType<typeof createItem>>;

  before(async () => {
    resetCookies();
    await freshDatabase();
    orgA = await createOrg();
    orgB = await createOrg();
    manager = await addMember(orgA.org.id, "manager");
    worker = await addMember(orgA.org.id, "worker");
    itemA = await createItem(orgA.org.id);
    itemB = await createItem(orgB.org.id);
  });

  test("a worker cannot create, edit or delete a field definition", async () => {
    actAs(worker);
    const created = await createField({ label: "Brand", type: "text", required: false });
    assert.equal(created.ok, false);
  });

  test("a manager can create, edit and delete a field definition", async () => {
    actAs(manager);
    const created = await createField({ label: "Brand", type: "text", required: false });
    assert.ok(created.ok);
    const field = created.value;

    const updated = await updateField(field.id, { label: "Brand name", required: true });
    assert.ok(updated.ok);

    const fields = await getMyFieldDefinitions();
    assert.equal(fields.find((f) => f.id === field.id)?.label, "Brand name");

    const deleted = await deleteField(field.id);
    assert.ok(deleted.ok);
  });

  test("a worker cannot set an item's custom values", async () => {
    actAs(manager);
    const created = await createField({ label: "Serial", type: "text", required: false });
    assert.ok(created.ok);
    const field = created.value;

    actAs(worker);
    const result = await setItemCustomValues(itemA.id, { [field.id]: "SN-1" });
    assert.equal(result.ok, false);
  });

  test("a manager cannot set custom values on another organization's item", async () => {
    actAs(manager);
    const fields = await getMyFieldDefinitions();
    const serial = fields.find((f) => f.label === "Serial");
    assert.ok(serial);
    const result = await setItemCustomValues(itemB.id, { [serial.id]: "SN-2" });
    assert.equal(result.ok, false);

    const values = await getMyItemsCustomValues([itemB.id]);
    assert.deepEqual(values, {});
  });
});
