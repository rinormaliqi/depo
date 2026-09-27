import { getFieldDefinitions } from "@/lib/custom-fields";
import { itemsImportTemplate } from "@/lib/import-items";
import { requireOrgId } from "@/lib/session";

// The example file next to the paste box — one column per custom field
// this org has defined, after the fixed name/unit/sku/category, so the
// download always matches what a paste is actually checked against.
export async function GET() {
  const organizationId = await requireOrgId();
  const fieldDefs = await getFieldDefinitions(organizationId);
  return new Response(itemsImportTemplate(fieldDefs), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="smartdepo-artikujt.csv"',
    },
  });
}
