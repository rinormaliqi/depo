// Turns whatever a company pastes from its spreadsheet — or the CSV it
// exported — into item rows, and says exactly which lines it can't use.
// Pure: no database, no session; the server action in
// src/app/items/import/actions.ts decides what the rows mean against the
// existing catalogue, this only reads the text (via parseTable). Columns
// are name, unit, sku, category — required first, so a two-column
// "name, unit" paste just works — followed by one column per custom field
// the organization has defined (src/lib/custom-fields.ts), in the same
// order they're shown everywhere else (sortOrder).

import { MAX_FIELD_CHARS, normalizeHeader, parseTable, type Delimiter, type TableSpec } from "@/lib/import-table";
import { validateCustomFieldValue, type FieldDefinition } from "@/lib/custom-fields";

export { MAX_IMPORT_CHARS, MAX_IMPORT_ROWS } from "@/lib/import-table";

export const IMPORT_COLUMNS = ["name", "unit", "sku", "category"] as const;
export type ImportColumn = (typeof IMPORT_COLUMNS)[number];

export type ImportRow = {
  line: number;
  name: string;
  unit: string;
  sku: string | null;
  category: string | null;
  // Keyed by fieldDefinitionId — present only for a field this row actually
  // sets. A field absent here (blank cell, not required) is cleared on an
  // update and simply never written on a create, matching how a blank
  // `category` already overwrites an existing one on re-import.
  customValues: Record<string, string>;
};

export type ImportErrorCode = "nameMissing" | "unitMissing" | "tooLong" | "duplicateSku" | "tooManyRows" | "empty";
export type CustomFieldImportErrorCode = "required" | "tooLong" | "invalidNumber" | "invalidDate" | "invalidOption";
export type ImportError =
  | { line: number; code: ImportErrorCode; field?: ImportColumn; value?: string }
  // `field` is the field definition's id here, not a label — the UI
  // resolves it through columnLabels (src/components/paste-import.tsx)
  // the same way it resolves a custom field's header, since a label isn't
  // a translation key.
  | { line: number; code: `customField.${CustomFieldImportErrorCode}`; field: string; value?: string };

export type ParsedImport = {
  rows: ImportRow[];
  errors: ImportError[];
  delimiter: Delimiter;
  hasHeader: boolean;
};

const BASE_ALIASES: Record<ImportColumn, readonly string[]> = {
  name: ["name", "item", "product", "emri", "artikulli", "artikull", "produkti", "produkt", "pershkrimi", "description"],
  unit: ["unit", "uom", "unit of measure", "njesia", "njesia matese", "nm", "masa"],
  sku: ["sku", "code", "kodi", "kod", "barcode", "barkodi", "shifra", "art. nr", "art nr", "artnr"],
  category: ["category", "kategoria", "kategori", "grupi", "group", "lloji", "type"],
};

// A custom field's column is identified by its id (stable, unlike a label
// someone might rename), matched in a header row by its current label.
function buildSpec(fieldDefs: FieldDefinition[]): TableSpec<string> {
  const columns = [...IMPORT_COLUMNS, ...fieldDefs.map((f) => f.id)];
  const aliases: Record<string, readonly string[]> = { ...BASE_ALIASES };
  for (const def of fieldDefs) aliases[def.id] = [normalizeHeader(def.label)];
  return { columns, aliases };
}

export function parseItemsText(text: string, fieldDefs: FieldDefinition[] = []): ParsedImport {
  const spec = buildSpec(fieldDefs);
  const table = parseTable(text, spec);
  if (!table.ok) {
    return { rows: [], errors: [{ line: table.line, code: table.error }], delimiter: table.delimiter, hasHeader: table.hasHeader };
  }

  const rows: ImportRow[] = [];
  const errors: ImportError[] = [];
  const seenSkus = new Set<string>();
  for (const { line, cells } of table.records) {
    const name = cells.name;
    const unit = cells.unit;
    const sku = cells.sku;
    const category = cells.category;
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

    const customValues: Record<string, string> = {};
    for (const def of fieldDefs) {
      const result = validateCustomFieldValue(def, cells[def.id] ?? "");
      if (!result.ok) {
        errors.push({ line, code: `customField.${result.error}`, field: def.id, value: (cells[def.id] ?? "").slice(0, 30) });
        ok = false;
      } else if (result.value !== null) {
        customValues[def.id] = result.value;
      }
    }

    if (ok) rows.push({ line, name, unit, sku: sku || null, category: category || null, customValues });
  }

  return { rows, errors, delimiter: table.delimiter, hasHeader: table.hasHeader };
}

// The file offered for download next to the paste box — the columns in
// the positional order, with one example line so the shape (including any
// custom field columns this org has defined) is obvious.
export function itemsImportTemplate(fieldDefs: FieldDefinition[] = []): string {
  const exampleFor = (def: FieldDefinition) => {
    if (def.type === "select") return def.options?.[0] ?? "";
    if (def.type === "boolean") return "true";
    if (def.type === "date") return "2026-01-15";
    if (def.type === "number") return "1";
    return "";
  };
  const header = ["name", "unit", "sku", "category", ...fieldDefs.map((f) => f.label)];
  const example = ["Çimento 50kg", "thes", "NDR-0001", "Çimento", ...fieldDefs.map(exampleFor)];
  return [header.join(";"), example.join(";"), ""].join("\r\n");
}
