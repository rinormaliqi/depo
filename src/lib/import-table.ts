// The text-to-cells half every import shares: a paste from Excel or a
// CSV becomes records with a line number, and a first line that looks
// like a header maps the columns by name. What a column *means* — which
// are required, what a value must look like — is the caller's
// (src/lib/import-items.ts, src/lib/import-stock.ts).
//
// Accepted shapes, in order of how often they'll show up:
//   - Excel copy-paste: tab-separated, a header row optional
//   - CSV as Excel saves it in a European locale: ";" separated
//   - plain "," CSV
// Quotes work the RFC 4180 way ("" escapes a quote, a quoted field may
// contain the delimiter or a line break).

import { stripFormulaGuard } from "./csv";

export type Delimiter = "\t" | ";" | ",";

export const MAX_IMPORT_ROWS = 5000;
export const MAX_IMPORT_CHARS = 2 * 1024 * 1024;
export const MAX_FIELD_CHARS = 200;

export type TableSpec<C extends string> = {
  // Positional order when there's no header — required columns first,
  // so a paste with only those just works.
  columns: readonly C[];
  // Header spellings people actually type, lower-cased, diacritics
  // stripped (see normalizeHeader); the first column is the one whose
  // presence makes a line a header.
  aliases: Record<C, readonly string[]>;
};

export type TableRecord<C extends string> = { line: number; cells: Record<C, string> };

export type TableParse<C extends string> =
  | { ok: true; records: TableRecord<C>[]; delimiter: Delimiter; hasHeader: boolean }
  | { ok: false; error: "empty" | "tooManyRows"; line: number; delimiter: Delimiter; hasHeader: boolean };

export function normalizeHeader(cell: string) {
  return cell
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9. ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectDelimiter(text: string): Delimiter {
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

  // A cell the export guarded against Excel's formula parsing comes back
  // as its original value here — see addFormulaGuard() in src/lib/csv.ts.
  const pushCell = () => {
    cells.push(stripFormulaGuard(cell));
    cell = "";
  };

  const endRecord = () => {
    cells.push(stripFormulaGuard(cell));
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
      pushCell();
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

export function parseTable<C extends string>(text: string, spec: TableSpec<C>): TableParse<C> {
  const delimiter = detectDelimiter(text);
  const raw = tokenize(text, delimiter).filter((r) => r.cells.some((c) => c.trim().length > 0));

  const headerColumn = (cell: string): C | null => {
    const key = normalizeHeader(cell);
    return spec.columns.find((column) => spec.aliases[column].includes(key)) ?? null;
  };

  let hasHeader = false;
  let mapping: (C | null)[] = [...spec.columns];
  if (raw.length > 0) {
    const first = raw[0].cells.map(headerColumn);
    // A header is a line where the leading column is recognised and most
    // of the other cells are known columns too; the rest (a "unit" column
    // on a stock export, a "price" column from the company's own sheet)
    // are simply skipped. A product called "Kodi" on line 1 would be a
    // very unlucky catalogue.
    const filled = raw[0].cells.filter((c) => c.trim() !== "").length;
    const known = first.filter((c) => c !== null).length;
    if (first.includes(spec.columns[0]) && known * 2 >= filled) {
      hasHeader = true;
      mapping = first;
      raw.shift();
    }
  }

  if (raw.length === 0) return { ok: false, error: "empty", line: 1, delimiter, hasHeader };
  if (raw.length > MAX_IMPORT_ROWS) return { ok: false, error: "tooManyRows", line: raw[MAX_IMPORT_ROWS].line, delimiter, hasHeader };

  const records = raw.map((r) => {
    const cells = {} as Record<C, string>;
    for (const column of spec.columns) {
      const i = mapping.indexOf(column);
      cells[column] = i === -1 ? "" : (r.cells[i] ?? "").trim();
    }
    return { line: r.line, cells };
  });
  return { ok: true, records, delimiter, hasHeader };
}
