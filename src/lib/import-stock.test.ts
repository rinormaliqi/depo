import assert from "node:assert/strict";
import { test } from "node:test";
import { parseQuantity, parseStockText } from "./import-stock";

test("quantities: whole positive numbers, spreadsheet thousands separators tolerated", () => {
  assert.equal(parseQuantity("40"), 40);
  assert.equal(parseQuantity(" 40 "), 40);
  assert.equal(parseQuantity("1.200"), 1200);
  assert.equal(parseQuantity("1 200"), 1200);
  assert.equal(parseQuantity("1.234.567"), 1234567);
  assert.equal(parseQuantity("12 345"), 12345);
  for (const bad of ["", "0", "-3", "40,5", "abc", "4e2"]) assert.equal(parseQuantity(bad), null, bad);

  // A decimal is not a quantity this app can store, so it is refused
  // rather than read as its digits with the point taken out: "3.0" is
  // three, not thirty, and a spreadsheet column formatted to one decimal
  // place used to inflate a whole opening inventory tenfold in silence.
  for (const decimal of ["3.0", "1.5", "2.75", "0.5", "1.20"]) assert.equal(parseQuantity(decimal), null, decimal);

  // The separator has to be used consistently to read as thousands.
  for (const odd of ["1.2345", "1.234 567"]) assert.equal(parseQuantity(odd), null, odd);
});

test("Excel paste with an Albanian header; bin codes upper-cased like the Scanner", () => {
  const parsed = parseStockText("Artikulli\tKutia\tSasia\nNDR-0001\ta-01-1-1\t40\nKabllo 3x1.5\tA-01-1-2\t1.200\n");
  assert.equal(parsed.hasHeader, true);
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.rows, [
    { line: 2, item: "NDR-0001", location: "A-01-1-1", quantity: 40 },
    { line: 3, item: "Kabllo 3x1.5", location: "A-01-1-2", quantity: 1200 },
  ]);
});

test("no header: item, location, quantity positionally; every problem names its line", () => {
  const parsed = parseStockText(["NDR-1;A-01-1;5", ";A-01-2;5", "NDR-2;;5", "NDR-3;A-01-3;zero", "NDR-4;A-01-4;-1"].join("\n"));
  assert.equal(parsed.hasHeader, false);
  assert.deepEqual(parsed.rows, [{ line: 1, item: "NDR-1", location: "A-01-1", quantity: 5 }]);
  assert.deepEqual(
    parsed.errors.map((e) => [e.line, e.code]),
    [
      [2, "itemMissing"],
      [3, "locationMissing"],
      [4, "quantityInvalid"],
      [5, "quantityInvalid"],
    ],
  );
});

test("empty input is one early error", () => {
  assert.deepEqual(parseStockText("  \n").errors, [{ line: 1, code: "empty" }]);
});
