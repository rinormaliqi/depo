import { itemsImportTemplate } from "@/lib/import-items";

// The example file next to the paste box. Static text, but served from a
// route rather than public/ so it stays next to the parser that reads it.
export function GET() {
  return new Response(itemsImportTemplate(), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="smartdepo-artikujt.csv"',
    },
  });
}
