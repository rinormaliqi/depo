import assert from "node:assert/strict";
import { test } from "node:test";
import type { FieldDefinition } from "./custom-fields";
import { MAX_IMPORT_ROWS, itemsImportTemplate, parseItemsText } from "./import-items";
import { detectDelimiter, tokenize } from "./import-table";

let fieldCounter = 0;
function field(overrides: Partial<FieldDefinition> & Pick<FieldDefinition, "label" | "type">): FieldDefinition {
  fieldCounter += 1;
  return {
    id: `field-${fieldCounter}`,
    organizationId: "org-1",
    key: overrides.label.toLowerCase(),
    options: null,
    required: false,
    sortOrder: fieldCounter,
    createdAt: new Date(),
    ...overrides,
  };
}

test("delimiter: a tab anywhere wins, then ';' over ',' by count", () => {
  assert.equal(detectDelimiter("a\tb\tc"), "\t");
  assert.equal(detectDelimiter("a;b;c\n1,2;3"), ";");
  assert.equal(detectDelimiter("a,b,c"), ",");
  assert.equal(detectDelimiter("\n\n  \nÇimento 50kg;thes"), ";", "leading blank lines are skipped");
  assert.equal(detectDelimiter("just one column"), ",");
});

test("tokenize: quotes, escaped quotes, delimiter and newline inside a quoted field, CRLF", () => {
  const records = tokenize('a,"b,c","say ""hi""","two\nlines"\r\nx,y', ",");
  assert.deepEqual(records, [
    { line: 1, cells: ["a", "b,c", 'say "hi"', "two\nlines"] },
    { line: 3, cells: ["x", "y"] },
  ]);
});

test("Excel paste with an Albanian header maps columns by name in any order", () => {
  const text = "Kodi\tEmri\tKategoria\tNjësia\nNDR-0001\tÇimento 50kg\tÇimento\tthes\nNDR-0002\tHekur Ø12\t\tm\n";
  const parsed = parseItemsText(text);
  assert.equal(parsed.delimiter, "\t");
  assert.equal(parsed.hasHeader, true);
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.rows, [
    { line: 2, name: "Çimento 50kg", unit: "thes", sku: "NDR-0001", category: "Çimento", customValues: {} },
    { line: 3, name: "Hekur Ø12", unit: "m", sku: "NDR-0002", category: null, customValues: {} },
  ]);
});

test("no header: positional name, unit, sku, category — a two-column paste is enough", () => {
  const parsed = parseItemsText("Vida 4x40;paketë\nSilikon 300ml;copë;NDR-0020;Vegla\n");
  assert.equal(parsed.hasHeader, false);
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.rows, [
    { line: 1, name: "Vida 4x40", unit: "paketë", sku: null, category: null, customValues: {} },
    { line: 2, name: "Silikon 300ml", unit: "copë", sku: "NDR-0020", category: "Vegla", customValues: {} },
  ]);
});

test("a header with columns we don't know (blank, or the company's own) still maps the ones we do", () => {
  const parsed = parseItemsText("name,unit,sku,\nBolt,pcs,B-1,\n");
  assert.equal(parsed.hasHeader, true);
  assert.equal(parsed.rows.length, 1);

  const extra = parseItemsText("Kodi;Çmimi;Emri;Furnitori;Njësia\nB-1;4.50;Bulon;ACME;copë\n");
  assert.equal(extra.hasHeader, true);
  assert.deepEqual(extra.rows, [{ line: 2, name: "Bulon", unit: "copë", sku: "B-1", category: null, customValues: {} }]);

  const notHeader = parseItemsText("Emri;a;b;c;d\nBulon;copë\n");
  assert.equal(notHeader.hasHeader, false, "one known cell out of five is a product line, not a header");
});

test("errors carry the source line number; good rows still parse", () => {
  const text = ["name;unit;sku", "", "Ok;pcs;A-1", ";pcs;A-2", "NoUnit;;A-3", "Dup;pcs;A-1", "Fine;kg;"].join("\n");
  const parsed = parseItemsText(text);
  assert.deepEqual(parsed.errors, [
    { line: 4, code: "nameMissing" },
    { line: 5, code: "unitMissing" },
    { line: 6, code: "duplicateSku", value: "A-1" },
  ]);
  assert.deepEqual(
    parsed.rows.map((r) => [r.line, r.name]),
    [
      [3, "Ok"],
      [7, "Fine"],
    ],
  );
});

test("a field over 200 characters is refused with the field named", () => {
  const parsed = parseItemsText(`${"x".repeat(201)};pcs`);
  assert.equal(parsed.errors[0].code, "tooLong");
  assert.equal(parsed.errors[0].field, "name");
  assert.equal(parsed.rows.length, 0);
});

test("empty input and too many rows are single, early errors", () => {
  assert.deepEqual(parseItemsText("\n  \n").errors, [{ line: 1, code: "empty" }]);
  const big = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `Item ${i};pcs`).join("\n");
  const parsed = parseItemsText(big);
  assert.equal(parsed.errors[0].code, "tooManyRows");
  assert.equal(parsed.rows.length, 0);
});

// Custom fields (Epic #5's import follow-up): a column per field
// definition, after category, matched by label in a header row or by
// sortOrder position without one.
test("custom field columns are matched by header label", () => {
  const brand = field({ label: "Brand", type: "text" });
  const expiry = field({ label: "Expiry", type: "date" });
  const text = "name;unit;brand;expiry\nKabllo;m;Acme;2027-01-15\n";
  const parsed = parseItemsText(text, [brand, expiry]);
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.rows, [
    { line: 2, name: "Kabllo", unit: "m", sku: null, category: null, customValues: { [brand.id]: "Acme", [expiry.id]: "2027-01-15" } },
  ]);
});

test("custom field columns fall back to position (after category) with no header", () => {
  const brand = field({ label: "Brand", type: "text" });
  const parsed = parseItemsText("Kabllo;m;;;Acme\n", [brand]);
  assert.deepEqual(parsed.rows, [{ line: 1, name: "Kabllo", unit: "m", sku: null, category: null, customValues: { [brand.id]: "Acme" } }]);
});

test("a required custom field left blank is a preview error, not a silent skip", () => {
  const brand = field({ label: "Brand", type: "text", required: true });
  const parsed = parseItemsText("name;unit;brand\nKabllo;m;\n", [brand]);
  assert.deepEqual(parsed.errors, [{ line: 2, code: "customField.required", field: brand.id, value: "" }]);
  assert.equal(parsed.rows.length, 0);
});

test("each custom field type is validated the same way setItemValues validates it", () => {
  const qty = field({ label: "Qty", type: "number" });
  const expiry = field({ label: "Expiry", type: "date" });
  const colour = field({ label: "Colour", type: "select", options: ["Red", "Blue"] });
  const defs = [qty, expiry, colour];

  const badNumber = parseItemsText("name;unit;qty;expiry;colour\nA;m;abc;2027-01-15;Red\n", defs);
  assert.equal(badNumber.errors[0].code, "customField.invalidNumber");

  const badDate = parseItemsText("name;unit;qty;expiry;colour\nA;m;5;15/01/2027;Red\n", defs);
  assert.equal(badDate.errors[0].code, "customField.invalidDate", "ambiguous non-ISO dates are refused, not guessed at");

  const badOption = parseItemsText("name;unit;qty;expiry;colour\nA;m;5;2027-01-15;Green\n", defs);
  assert.equal(badOption.errors[0].code, "customField.invalidOption");

  const ok = parseItemsText("name;unit;qty;expiry;colour\nA;m;5;2027-01-15;Red\n", defs);
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.rows[0].customValues, { [qty.id]: "5", [expiry.id]: "2027-01-15", [colour.id]: "Red" });
});

test("a boolean custom field accepts local yes/no synonyms, normalized to true/false", () => {
  const inStock = field({ label: "In stock", type: "boolean" });
  const parsed = parseItemsText("name;unit;in stock\nA;m;po\nB;m;jo\nC;m;true\n", [inStock]);
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(
    parsed.rows.map((r) => r.customValues[inStock.id]),
    ["true", "false", "true"],
  );
});

test("an org with no custom fields parses exactly as before (no customValues entries)", () => {
  const parsed = parseItemsText("name;unit\nA;m\n");
  assert.deepEqual(parsed.rows[0].customValues, {});
});

test("the downloadable template gets one column per field, with a type-appropriate example", () => {
  const brand = field({ label: "Brand", type: "text" });
  const colour = field({ label: "Colour", type: "select", options: ["Red", "Blue"] });
  const template = itemsImportTemplate([brand, colour]);
  const [header, example] = template.trim().split("\r\n");
  assert.equal(header, "name;unit;sku;category;Brand;Colour");
  assert.equal(example.split(";").length, 6);
  assert.ok(example.endsWith("Red"), "the select field's example is one of its own options");
});
