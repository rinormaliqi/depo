import { stockImportTemplate } from "@/lib/import-stock";

export function GET() {
  return new Response(stockImportTemplate(), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="smartdepo-stoku.csv"',
    },
  });
}
