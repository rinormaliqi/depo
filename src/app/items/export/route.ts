import { eq } from "drizzle-orm";
import { db } from "@/db";
import { items } from "@/db/schema";
import { getCapabilities } from "@/lib/capabilities";
import { csvResponse, fileDate, toCsv } from "@/lib/csv";
import { getFieldDefinitions, getValuesForItems } from "@/lib/custom-fields";

// The catalogue as the items import reads it (name, unit, sku,
// category), so export → edit in Excel → import is the bulk-edit path.
// Same gate as /items: managers and admins; reading, so a locked
// company can still take its data out. Custom fields ride along as one
// column per definition, keyed by label — the import side doesn't read
// them back yet (see Epic #5 follow-up), this is read-only for now.
export async function GET() {
  const caps = await getCapabilities();
  if (!caps?.can.manageItems) return new Response("Forbidden", { status: 403 });

  const rows = await db
    .select({ id: items.id, name: items.name, unit: items.unitOfMeasure, sku: items.sku, category: items.category })
    .from(items)
    .where(eq(items.organizationId, caps.organizationId))
    .orderBy(items.name);

  const fieldDefs = await getFieldDefinitions(caps.organizationId);
  const customValues = await getValuesForItems(rows.map((r) => r.id));

  const header = ["name", "unit", "sku", "category", ...fieldDefs.map((f) => f.label)];
  const body = rows.map((r) => [
    r.name,
    r.unit,
    r.sku,
    r.category,
    ...fieldDefs.map((f) => customValues.get(r.id)?.[f.id] ?? ""),
  ]);

  const csv = toCsv([header, ...body]);
  return csvResponse(csv, `artikujt-${fileDate()}.csv`);
}
