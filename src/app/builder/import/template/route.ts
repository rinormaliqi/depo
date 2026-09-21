import { locationsImportTemplate } from "@/lib/import-locations";

export function GET() {
  return new Response(locationsImportTemplate(), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="smartdepo-lokacionet.csv"',
    },
  });
}
