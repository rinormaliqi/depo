import { eq } from "drizzle-orm";
import { db } from "@/db";
import { items } from "@/db/schema";
import { getCapabilities } from "@/lib/capabilities";
import { csvResponse, fileDate, toCsv } from "@/lib/csv";

// The catalogue as the items import reads it (name, unit, sku,
// category), so export → edit in Excel → import is the bulk-edit path.
// Same gate as /items: managers and admins; reading, so a locked
// company can still take its data out.
export async function GET() {
  const caps = await getCapabilities();
  if (!caps?.can.manageItems) return new Response("Forbidden", { status: 403 });

  const rows = await db
    .select({ name: items.name, unit: items.unitOfMeasure, sku: items.sku, category: items.category })
    .from(items)
    .where(eq(items.organizationId, caps.organizationId))
    .orderBy(items.name);

  const csv = toCsv([["name", "unit", "sku", "category"], ...rows.map((r) => [r.name, r.unit, r.sku, r.category])]);
  return csvResponse(csv, `artikujt-${fileDate()}.csv`);
}
