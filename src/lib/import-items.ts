// Turns whatever a company pastes from its spreadsheet — or the CSV it
// exported — into item rows, and says exactly which lines it can't use.
// Pure: no database, no session; the server action in
// src/app/items/import/actions.ts decides what the rows mean against the
// existing catalogue, this only reads the text.
//
// Accepted shapes, in order of how often they'll show up:
//   - Excel copy-paste: tab-separated, a header row optional
//   - CSV as Excel saves it in a European locale: ";" separated
//   - plain "," CSV
// Quotes work the RFC 4180 way ("" escapes a quote, a quoted field may
// contain the delimiter or a line break). Columns are matched by header
// name when the first line looks like a header (sq or en), otherwise
// taken positionally as name, unit, sku, category — required first, so a
// two-column "name, unit" paste just works.

export const IMPORT_COLUMNS = ["name", "unit", "sku", "category"] as const;
export type ImportColumn = (typeof IMPORT_COLUMNS)[number];

export const MAX_IMPORT_ROWS = 5000;
export const MAX_IMPORT_CHARS = 2 * 1024 * 1024;
const MAX_FIELD_CHARS = 200;

export type ImportRow = { line: number; name: string; unit: string; sku: string | null; category: string | null };

export type ImportErrorCode = "nameMissing" | "unitMissing" | "tooLong" | "duplicateSku" | "tooManyRows" | "empty";
export type ImportError = { line: number; code: ImportErrorCode; field?: ImportColumn; value?: string };

export type ParsedImport = {
  rows: ImportRow[];
  errors: ImportError[];
  delimiter: "\t" | ";" | ",";
  hasHeader: boolean;
};

// Header spellings people actually type, lower-cased, diacritics stripped.
const HEADER_ALIASES: Record<ImportColumn, string[]> = {
  name: ["name", "item", "product", "emri", "artikulli", "artikull", "produkti", "produkt", "pershkrimi", "description"],
  unit: ["unit", "uom", "unit of measure", "njesia", "njesia matese", "nm", "masa"],
  sku: ["sku", "code", "kodi", "kod", "barcode", "barkodi", "shifra", "art. nr", "art nr", "artnr"],
  category: ["category", "kategoria", "kategori", "grupi", "group", "lloji", "type"],
};

function normalizeHeader(cell: string) {
  return cell
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9. ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function headerColumn(cell: string): ImportColumn | null {
  const key = normalizeHeader(cell);
  for (const column of IMPORT_COLUMNS) {
    if (HEADER_ALIASES[column].includes(key)) return column;
  }
  return null;
}

export function detectDelimiter(text: string): ParsedImport["delimiter"] {
  // Judged on the first non-empty line: a tab anywhere means a paste
  // from a spreadsheet, which never contains tabs otherwise.
  const first = text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "";
  if (first.includes("\t")) return "\t";
  const semis = (first.match(/;/g) ?? []).length;
  const commas = (first.match(/,/g) ?? []).length;
  return semis >= commas && semis > 0 ? ";" : ",";
}

// Records as arrays of cells, with the 1-based line each record started
// on (a quoted field can span lines, so records and lines differ).
export function tokenize(text: string, delimiter: string): { line: number; cells: string[] }[] {
  const records: { line: number; cells: string[] }[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let line = 1;
  let recordLine = 1;
  let atRecordStart = true;

  const endRecord = () => {
    cells.push(cell);
    records.push({ line: recordLine, cells });
    cells = [];
    cell = "";
    atRecordStart = true;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (atRecordStart) {
      recordLine = line;
      atRecordStart = false;
    }
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        if (ch === "\n") line++;
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && cell.length === 0) {
      quoted = true;
    } else if (ch === delimiter) {
      cells.push(cell);
      cell = "";
    } else if (ch === "\n" || (ch === "\r" && text[i + 1] === "\n")) {
      if (ch === "\r") i++;
      endRecord();
      line++;
    } else if (ch === "\r") {
      endRecord();
      line++;
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || cells.length > 0) endRecord();
  return records;
}

export function parseItemsText(text: string): ParsedImport {
  const delimiter = detectDelimiter(text);
  const records = tokenize(text, delimiter).filter((r) => r.cells.some((c) => c.trim().length > 0));

  let hasHeader = false;
  let mapping: (ImportColumn | null)[] = [...IMPORT_COLUMNS];
  if (records.length > 0) {
    const first = records[0].cells.map(headerColumn);
    // A header is a line where the name column is recognised and every
    // other cell is either a known column or blank — a product called
    // "Kodi" on line 1 would be a very unlucky catalogue.
    if (first.includes("name") && first.every((c, i) => c !== null || records[0].cells[i].trim() === "")) {
      hasHeader = true;
      mapping = first;
      records.shift();
    }
  }

  const errors: ImportError[] = [];
  if (records.length === 0) {
    errors.push({ line: 1, code: "empty" });
    return { rows: [], errors, delimiter, hasHeader };
  }
  if (records.length > MAX_IMPORT_ROWS) {
    errors.push({ line: records[MAX_IMPORT_ROWS].line, code: "tooManyRows" });
    return { rows: [], errors, delimiter, hasHeader };
  }

  const rows: ImportRow[] = [];
  const seenSkus = new Map<string, number>();
  for (const record of records) {
    const get = (column: ImportColumn) => {
      const i = mapping.indexOf(column);
      return i === -1 ? "" : (record.cells[i] ?? "").trim();
    };
    const name = get("name");
    const unit = get("unit");
    const sku = get("sku");
    const category = get("category");
    let ok = true;

    if (!name) {
      errors.push({ line: record.line, code: "nameMissing" });
      ok = false;
    }
    if (!unit) {
      errors.push({ line: record.line, code: "unitMissing" });
      ok = false;
    }
    for (const [field, value] of [["name", name], ["unit", unit], ["sku", sku], ["category", category]] as const) {
      if (value.length > MAX_FIELD_CHARS) {
        errors.push({ line: record.line, code: "tooLong", field, value: value.slice(0, 30) + "…" });
        ok = false;
      }
    }
    if (sku) {
      const firstLine = seenSkus.get(sku);
      if (firstLine !== undefined) {
        errors.push({ line: record.line, code: "duplicateSku", value: sku });
        ok = false;
      } else {
        seenSkus.set(sku, record.line);
      }
    }
    if (ok) rows.push({ line: record.line, name, unit, sku: sku || null, category: category || null });
  }

  return { rows, errors, delimiter, hasHeader };
}

// The file offered for download next to the paste box — the columns in
// the positional order, with two example lines so the shape is obvious.
export function itemsImportTemplate(): string {
  return ["name;unit;sku;category", "Çimento 50kg;thes;NDR-0001;Çimento", "Kabllo 3x1.5;m;ELK-0001;Kabllo", ""].join("\r\n");
}
