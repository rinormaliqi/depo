import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_IMPORT_ROWS, parseItemsText } from "./import-items";
import { detectDelimiter, tokenize } from "./import-table";

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
    { line: 2, name: "Çimento 50kg", unit: "thes", sku: "NDR-0001", category: "Çimento" },
    { line: 3, name: "Hekur Ø12", unit: "m", sku: "NDR-0002", category: null },
  ]);
});

test("no header: positional name, unit, sku, category — a two-column paste is enough", () => {
  const parsed = parseItemsText("Vida 4x40;paketë\nSilikon 300ml;copë;NDR-0020;Vegla\n");
  assert.equal(parsed.hasHeader, false);
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.rows, [
    { line: 1, name: "Vida 4x40", unit: "paketë", sku: null, category: null },
    { line: 2, name: "Silikon 300ml", unit: "copë", sku: "NDR-0020", category: "Vegla" },
  ]);
});

test("an English header with an unknown column is still a header when the rest is blank-or-known", () => {
  const parsed = parseItemsText("name,unit,sku,\nBolt,pcs,B-1,\n");
  assert.equal(parsed.hasHeader, true);
  assert.equal(parsed.rows.length, 1);
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
