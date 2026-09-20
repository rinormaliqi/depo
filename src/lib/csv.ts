// The writing half of the imports: rows to a CSV Excel opens correctly
// — ";" separated as a European locale expects (the same shape the
// import templates use, so an export re-imports as-is), a UTF-8 BOM so
// "ç" and "ë" survive Excel's guess at the encoding, CRLF line ends,
// and RFC 4180 quoting for a field holding the delimiter, a quote or a
// line break. src/lib/import-table.ts tokenize() reads this back exactly.

export const CSV_DELIMITER = ";";

function escapeCell(value: string | number | null | undefined, delimiter: string) {
  const s = value === null || value === undefined ? "" : String(value);
  return /["\r\n]/.test(s) || s.includes(delimiter) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: (string | number | null | undefined)[][], delimiter = CSV_DELIMITER): string {
  return "﻿" + rows.map((r) => r.map((c) => escapeCell(c, delimiter)).join(delimiter)).join("\r\n") + "\r\n";
}

export function csvResponse(body: string, filename: string) {
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

// "2026-09-20" for a filename; "Fabrika Prizren" → "fabrika-prizren".
export function fileDate(d = new Date()) {
  return d.toISOString().slice(0, 10);
}
export function fileSlug(name: string) {
  return (
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "export"
  );
}
