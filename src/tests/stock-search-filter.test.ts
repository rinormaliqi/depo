import { freshDatabase } from "@/test-support/setup";
import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { searchStock } from "@/app/stock/actions";
import { createFieldDefinition, setItemValues } from "@/lib/custom-fields";
import { receiveStockAt } from "@/lib/stock";
import { addMember, createBin, createItem, createOrg } from "@/test-support/factories";
import { actAs } from "@/test-support/stubs/auth";

// The stock search box gets the same "narrow by a custom field" control
// items already has (src/components/custom-field-filter.tsx) — this is
// the server side of it: searchStock accepts a {fieldId, value} filter on
// top of (or instead of) the text query.
describe("searchStock: custom field filter", () => {
  let org: Awaited<ReturnType<typeof createOrg>>;
  let worker: Awaited<ReturnType<typeof addMember>>;
  let bin: Awaited<ReturnType<typeof createBin>>;
  let cable: Awaited<ReturnType<typeof createItem>>;
  let lamp: Awaited<ReturnType<typeof createItem>>;
  let brand: Awaited<ReturnType<typeof createFieldDefinition>>;
  let colour: Awaited<ReturnType<typeof createFieldDefinition>>;

  before(async () => {
    await freshDatabase();
    org = await createOrg();
    worker = await addMember(org.org.id, "worker");
    bin = await createBin(org.facility.id, "A-01-1");
    cable = await createItem(org.org.id, "Cable");
    lamp = await createItem(org.org.id, "Lamp");
    brand = await createFieldDefinition(org.org.id, { label: "Brand", type: "text", required: false });
    colour = await createFieldDefinition(org.org.id, { label: "Colour", type: "select", required: false, options: ["Red", "Redwood"] });
    actAs(worker);
    await receiveStockAt(org.org.id, worker.id, bin.id, cable.id, 10);
    await receiveStockAt(org.org.id, worker.id, bin.id, lamp.id, 5);
    await setItemValues(cable.id, org.org.id, { [brand.id]: "Acme", [colour.id]: "Red" });
    await setItemValues(lamp.id, org.org.id, { [brand.id]: "Zenith", [colour.id]: "Redwood" });
  });

  test("a field filter alone (no text query) narrows the results", async () => {
    const hits = await searchStock("", { fieldId: brand.id, value: "Acme" });
    assert.deepEqual(hits.map((h) => h.itemName), ["Cable"]);
  });

  test("a select field matches exactly — 'Red' does not also catch 'Redwood'", async () => {
    const hits = await searchStock("", { fieldId: colour.id, value: "Red" });
    assert.deepEqual(hits.map((h) => h.itemName), ["Cable"]);
  });

  test("a text field matches by substring", async () => {
    const hits = await searchStock("", { fieldId: brand.id, value: "cme" });
    assert.deepEqual(hits.map((h) => h.itemName), ["Cable"]);
  });

  test("a field picked with no value yet returns nothing, not everything", async () => {
    const hits = await searchStock("", { fieldId: brand.id, value: "" });
    assert.deepEqual(hits, []);
  });

  test("the text query and the field filter combine (AND, not OR)", async () => {
    const hits = await searchStock("Lamp", { fieldId: brand.id, value: "Acme" });
    assert.deepEqual(hits, [], "Lamp matches the text but not the Acme brand");
  });

  test("a field id from another organization is ignored, not trusted", async () => {
    const other = await createOrg();
    const otherField = await createFieldDefinition(other.org.id, { label: "Serial", type: "text", required: false });
    // Still scoped to org A's session; org B's field id shouldn't leak a
    // filter condition that happens to match everyone.
    const hits = await searchStock("Cable", { fieldId: otherField.id, value: "" });
    assert.deepEqual(hits.map((h) => h.itemName), ["Cable"], "the bogus field filter is dropped, the text query still runs");
  });
});
