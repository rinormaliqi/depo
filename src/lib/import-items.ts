// Turns whatever a company pastes from its spreadsheet — or the CSV it
// exported — into item rows, and says exactly which lines it can't use.
// Pure: no database, no session; the server action in
// src/app/items/import/actions.ts decides what the rows mean against the
// existing catalogue, this only reads the text (via parseTable). Columns
// are name, unit, sku, category — required first, so a two-column
// "name, unit" paste just works.

import { MAX_FIELD_CHARS, parseTable, type Delimiter, type TableSpec } from "@/lib/import-table";

export { MAX_IMPORT_CHARS, MAX_IMPORT_ROWS } from "@/lib/import-table";

export const IMPORT_COLUMNS = ["name", "unit", "sku", "category"] as const;
export type ImportColumn = (typeof IMPORT_COLUMNS)[number];

export type ImportRow = { line: number; name: string; unit: string; sku: string | null; category: string | null };

export type ImportErrorCode = "nameMissing" | "unitMissing" | "tooLong" | "duplicateSku" | "tooManyRows" | "empty";
export type ImportError = { line: number; code: ImportErrorCode; field?: ImportColumn; value?: string };

export type ParsedImport = {
  rows: ImportRow[];
  errors: ImportError[];
  delimiter: Delimiter;
  hasHeader: boolean;
};

const SPEC: TableSpec<ImportColumn> = {
  columns: IMPORT_COLUMNS,
  aliases: {
    name: ["name", "item", "product", "emri", "artikulli", "artikull", "produkti", "produkt", "pershkrimi", "description"],
    unit: ["unit", "uom", "unit of measure", "njesia", "njesia matese", "nm", "masa"],
    sku: ["sku", "code", "kodi", "kod", "barcode", "barkodi", "shifra", "art. nr", "art nr", "artnr"],
    category: ["category", "kategoria", "kategori", "grupi", "group", "lloji", "type"],
  },
};

export function parseItemsText(text: string): ParsedImport {
  const table = parseTable(text, SPEC);
  if (!table.ok) {
    return { rows: [], errors: [{ line: table.line, code: table.error }], delimiter: table.delimiter, hasHeader: table.hasHeader };
  }

  const rows: ImportRow[] = [];
  const errors: ImportError[] = [];
  const seenSkus = new Set<string>();
  for (const { line, cells } of table.records) {
    const { name, unit, sku, category } = cells;
    let ok = true;

    if (!name) {
      errors.push({ line, code: "nameMissing" });
      ok = false;
    }
    if (!unit) {
      errors.push({ line, code: "unitMissing" });
      ok = false;
    }
    for (const field of IMPORT_COLUMNS) {
      if (cells[field].length > MAX_FIELD_CHARS) {
        errors.push({ line, code: "tooLong", field, value: cells[field].slice(0, 30) + "…" });
        ok = false;
      }
    }
    if (sku) {
      if (seenSkus.has(sku)) {
        errors.push({ line, code: "duplicateSku", value: sku });
        ok = false;
      } else {
        seenSkus.add(sku);
      }
    }
    if (ok) rows.push({ line, name, unit, sku: sku || null, category: category || null });
  }

  return { rows, errors, delimiter: table.delimiter, hasHeader: table.hasHeader };
}

// The file offered for download next to the paste box — the columns in
// the positional order, with two example lines so the shape is obvious.
export function itemsImportTemplate(): string {
  return ["name;unit;sku;category", "Çimento 50kg;thes;NDR-0001;Çimento", "Kabllo 3x1.5;m;ELK-0001;Kabllo", ""].join("\r\n");
}
