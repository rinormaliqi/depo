// The inventory count as a list: which item, in which bin, how many.
// Pure like src/lib/import-items.ts — resolves nothing; the server action
// in src/app/stock/import/actions.ts looks the item and bin up in the
// facility. Columns are item, location, quantity: `item` is a SKU or, for
// a catalogue without SKUs, the item's exact name; `location` is the bin
// code printed on its label (A-03-2-4).

import { MAX_FIELD_CHARS, parseTable, type Delimiter, type TableSpec } from "@/lib/import-table";

export const STOCK_COLUMNS = ["item", "location", "quantity"] as const;
export type StockColumn = (typeof STOCK_COLUMNS)[number];

export type StockRow = { line: number; item: string; location: string; quantity: number };

export type StockErrorCode =
  | "itemMissing"
  | "locationMissing"
  | "quantityInvalid"
  | "tooLong"
  | "tooManyRows"
  | "empty"
  // From the server, once the row is looked up in the facility:
  | "itemUnknown"
  | "itemAmbiguous"
  | "locationUnknown";
export type StockError = { line: number; code: StockErrorCode; field?: StockColumn; value?: string };

export type ParsedStock = { rows: StockRow[]; errors: StockError[]; delimiter: Delimiter; hasHeader: boolean };

const SPEC: TableSpec<StockColumn> = {
  columns: STOCK_COLUMNS,
  aliases: {
    item: ["item", "sku", "code", "kodi", "kod", "artikulli", "artikull", "emri", "name", "product", "produkti", "barcode", "barkodi", "shifra"],
    location: ["location", "bin", "kutia", "kuti", "vendndodhja", "vendndodhje", "lokacioni", "lokacion", "rafti", "raft", "pozita", "kodi i kutise", "bin code", "vendi"],
    quantity: ["quantity", "qty", "sasia", "sasi", "count", "numri", "amount", "stoku", "stock"],
  },
};

// "40", " 40 ", "1.200" and "1 200" (a spreadsheet's thousands separator)
// are quantities; "40,5", "3.0", "-3", "abc" and "" are not — stock is
// whole units, and a count can't be negative or zero.
//
// The separator only counts as a thousands separator where it actually
// separates groups of three, and the same character has to be used
// throughout: "1.200" and "1 200" are twelve hundred, "1.234.567" is a
// million, but "3.0" and "1.5" are decimals this app cannot store, so
// they are refused rather than read as 30 and 15. Stripping every "."
// first is what made a column formatted to one decimal place import ten
// times the stock it meant, with no error to show for it.
const PLAIN = /^\d+$/;
const GROUPED = /^\d{1,3}(?:([ .])\d{3})(?:\1\d{3})*$/;

export function parseQuantity(cell: string): number | null {
  const s = cell.trim();
  if (!PLAIN.test(s) && !GROUPED.test(s)) return null;
  const n = Number(s.replace(/[ .]/g, ""));
  return n > 0 && Number.isSafeInteger(n) ? n : null;
}

export function parseStockText(text: string): ParsedStock {
  const table = parseTable(text, SPEC);
  if (!table.ok) {
    return { rows: [], errors: [{ line: table.line, code: table.error }], delimiter: table.delimiter, hasHeader: table.hasHeader };
  }

  const rows: StockRow[] = [];
  const errors: StockError[] = [];
  for (const { line, cells } of table.records) {
    const { item, location } = cells;
    let ok = true;
    if (!item) {
      errors.push({ line, code: "itemMissing" });
      ok = false;
    }
    if (!location) {
      errors.push({ line, code: "locationMissing" });
      ok = false;
    }
    const quantity = parseQuantity(cells.quantity);
    if (quantity === null) {
      errors.push({ line, code: "quantityInvalid", value: cells.quantity });
      ok = false;
    }
    for (const field of ["item", "location"] as const) {
      if (cells[field].length > MAX_FIELD_CHARS) {
        errors.push({ line, code: "tooLong", field, value: cells[field].slice(0, 30) + "…" });
        ok = false;
      }
    }
    // Bin codes are compared the way the Scanner does it (upper-cased),
    // so a count typed in lower case still lands.
    if (ok && quantity !== null) rows.push({ line, item, location: location.toUpperCase(), quantity });
  }
  return { rows, errors, delimiter: table.delimiter, hasHeader: table.hasHeader };
}

export function stockImportTemplate(): string {
  return ["item;location;quantity", "NDR-0001;A-01-1-1;40", "Kabllo 3x1.5;A-01-1-2;120", ""].join("\r\n");
}
