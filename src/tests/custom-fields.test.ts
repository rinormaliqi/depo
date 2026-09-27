import { freshDatabase } from "@/test-support/setup";
import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import {
  createFieldDefinition,
  deleteFieldDefinition,
  getFieldDefinitions,
  getValuesForItems,
  setItemValues,
  updateFieldDefinition,
} from "@/lib/custom-fields";
import { UserError } from "@/lib/user-error";
import { addMember, createItem, createOrg } from "@/test-support/factories";

describe("custom field definitions", () => {
  let orgA: Awaited<ReturnType<typeof createOrg>>;
  let orgB: Awaited<ReturnType<typeof createOrg>>;

  before(async () => {
    await freshDatabase();
    orgA = await createOrg();
    orgB = await createOrg();
  });

  test("creating a field slugifies the label into a key and rejects a blank label", async () => {
    const field = await createFieldDefinition(orgA.org.id, { label: "  Brand  ", type: "text", required: false });
    assert.equal(field.label, "Brand");
    assert.equal(field.key, "brand");

    await assert.rejects(createFieldDefinition(orgA.org.id, { label: "   ", type: "text", required: false }), UserError);
  });

  test("a second field with a colliding label gets a distinct key", async () => {
    const first = await createFieldDefinition(orgA.org.id, { label: "Model!", type: "text", required: false });
    const second = await createFieldDefinition(orgA.org.id, { label: "Model?", type: "text", required: false });
    assert.equal(first.key, "model");
    assert.equal(second.key, "model_2");
  });

  test("a select field requires at least one option, and rejects duplicates", async () => {
    await assert.rejects(createFieldDefinition(orgA.org.id, { label: "Colour", type: "select", required: false, options: [] }), UserError);
    await assert.rejects(
      createFieldDefinition(orgA.org.id, { label: "Colour", type: "select", required: false, options: ["Red", "Red"] }),
      UserError,
    );
    const field = await createFieldDefinition(orgA.org.id, { label: "Colour", type: "select", required: false, options: ["Red", " Blue ", ""] });
    assert.deepEqual(field.options, ["Red", "Blue"]);
  });

  test("updateFieldDefinition changes label/options/required but not type or key", async () => {
    const field = await createFieldDefinition(orgA.org.id, { label: "Size", type: "select", required: false, options: ["S", "M"] });
    await updateFieldDefinition(field.id, orgA.org.id, { label: "Sizing", required: true, options: ["S", "M", "L"] });
    const [reloaded] = (await getFieldDefinitions(orgA.org.id)).filter((f) => f.id === field.id);
    assert.equal(reloaded.label, "Sizing");
    assert.equal(reloaded.key, "size");
    assert.equal(reloaded.type, "select");
    assert.equal(reloaded.required, true);
    assert.deepEqual(reloaded.options, ["S", "M", "L"]);
  });

  test("a definition is scoped to its own organization", async () => {
    const field = await createFieldDefinition(orgA.org.id, { label: "Serial", type: "text", required: false });
    await assert.rejects(updateFieldDefinition(field.id, orgB.org.id, { label: "x", required: false }), UserError);
    await assert.rejects(deleteFieldDefinition(field.id, orgB.org.id), UserError);
    const orgBFields = await getFieldDefinitions(orgB.org.id);
    assert.equal(orgBFields.some((f) => f.id === field.id), false);
  });
});

describe("item custom field values", () => {
  let org: Awaited<ReturnType<typeof createOrg>>;
  let brand: Awaited<ReturnType<typeof createFieldDefinition>>;
  let expiry: Awaited<ReturnType<typeof createFieldDefinition>>;
  let colour: Awaited<ReturnType<typeof createFieldDefinition>>;
  let inStock: Awaited<ReturnType<typeof createFieldDefinition>>;
  let item: Awaited<ReturnType<typeof createItem>>;

  before(async () => {
    await freshDatabase();
    org = await createOrg();
    await addMember(org.org.id, "worker");
    brand = await createFieldDefinition(org.org.id, { label: "Brand", type: "text", required: true });
    expiry = await createFieldDefinition(org.org.id, { label: "Expiry", type: "date", required: false });
    colour = await createFieldDefinition(org.org.id, { label: "Colour", type: "select", required: false, options: ["Red", "Blue"] });
    inStock = await createFieldDefinition(org.org.id, { label: "In stock?", type: "boolean", required: false });
    item = await createItem(org.org.id);
  });

  test("a required field left blank is refused", async () => {
    await assert.rejects(setItemValues(item.id, org.org.id, {}), /Brand/);
  });

  test("valid values across every type are stored and read back", async () => {
    await setItemValues(item.id, org.org.id, {
      [brand.id]: "Acme",
      [expiry.id]: "2027-01-15",
      [colour.id]: "Red",
      [inStock.id]: "true",
    });
    const byItem = await getValuesForItems([item.id]);
    const values = byItem.get(item.id);
    assert.ok(values);
    assert.equal(values[brand.id], "Acme");
    assert.equal(values[expiry.id], "2027-01-15");
    assert.equal(values[colour.id], "Red");
    assert.equal(values[inStock.id], "true");
  });

  test("an invalid value for each type is refused and nothing changes", async () => {
    await assert.rejects(setItemValues(item.id, org.org.id, { [brand.id]: "Acme", [colour.id]: "Green" }), /Colour/);
    await assert.rejects(setItemValues(item.id, org.org.id, { [brand.id]: "Acme", [inStock.id]: "maybe" }), /In stock/);
    await assert.rejects(setItemValues(item.id, org.org.id, { [brand.id]: "Acme", [expiry.id]: "not-a-date" }), /Expiry/);

    const byItem = await getValuesForItems([item.id]);
    assert.equal(byItem.get(item.id)?.[colour.id], "Red", "the earlier valid value is untouched by a rejected call");
  });

  test("clearing an optional field removes its row instead of storing an empty string", async () => {
    await setItemValues(item.id, org.org.id, { [brand.id]: "Acme", [expiry.id]: "", [colour.id]: "Blue", [inStock.id]: "" });
    const byItem = await getValuesForItems([item.id]);
    const values = byItem.get(item.id) ?? {};
    assert.equal(expiry.id in values, false);
    assert.equal(inStock.id in values, false);
    assert.equal(values[colour.id], "Blue");
  });

  test("deleting a field definition cascades away every value stored for it", async () => {
    await deleteFieldDefinition(colour.id, org.org.id);
    const byItem = await getValuesForItems([item.id]);
    const values = byItem.get(item.id) ?? {};
    assert.equal(colour.id in values, false);
    assert.equal(values[brand.id], "Acme", "other fields on the same item are unaffected");
  });
});
