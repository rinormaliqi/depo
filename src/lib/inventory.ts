import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { inventorySettings } from "@/db/schema";
import { dailyOutflowFor, DEFAULT_INVENTORY_RULES, stockStatus, type InventoryRules, type StockStatus } from "@/lib/stock-status";

// Server-side reads for the stock status (#218). A plain module, not a
// "use server" file: every caller passes an organizationId it has already
// taken from the session (see the server-action surface test, #211).

export async function getInventoryRules(organizationId: string): Promise<InventoryRules> {
  const [row] = await db.select().from(inventorySettings).where(eq(inventorySettings.organizationId, organizationId));
  if (!row) return DEFAULT_INVENTORY_RULES;
  return {
    consumptionWindowDays: row.consumptionWindowDays,
    warnCoverDays: row.warnCoverDays,
    fallbackWarnRatio: row.fallbackWarnRatio,
    outflowReasons: row.outflowReasons,
  };
}

export type ItemStockStatus = {
  itemId: string;
  name: string;
  sku: string | null;
  category: string | null;
  unitOfMeasure: string;
  min: number | null;
  max: number | null;
  warnDays: number | null;
  quantity: number;
  /** Units used up within the rules' window. */
  outflowInWindow: number;
  dailyOutflow: number;
  lastOutflowAt: Date | null;
  status: StockStatus;
  daysLeft: number | null;
};

type Row = {
  item_id: string;
  name: string;
  sku: string | null;
  category: string | null;
  unit_of_measure: string;
  min_stock_level: number | null;
  max_stock_level: number | null;
  warn_days: number | null;
  quantity: number;
  outflow_window: number;
  last_outflow_at: Date | string | null;
  first_seen_at: Date | string | null;
};

const asDate = (v: Date | string | null) => (v === null ? null : v instanceof Date ? v : new Date(v));

// Every item of the company with its status. With a facility, quantities
// and consumption count only that facility's bins — what its own floor
// needs; without one, the whole company. One pass over stock and one over
// movements, grouped by item, whatever the number of items.
export async function getItemStockStatuses(
  organizationId: string,
  { facilityId = null, now = new Date(), rules }: { facilityId?: string | null; now?: Date; rules?: InventoryRules } = {},
): Promise<ItemStockStatus[]> {
  const r = rules ?? (await getInventoryRules(organizationId));
  const since = new Date(now.getTime() - r.consumptionWindowDays * 86_400_000);
  const reasons = r.outflowReasons.length ? r.outflowReasons : ["__none__"];
  const reasonList = sql.join(reasons.map((x) => sql`${x}`), sql`, `);
  // Locations are joined only to filter by facility; company-wide they'd be
  // two extra joins over every movement for nothing.
  const stockJoin = facilityId ? sql`join locations l on l.id = s.location_id and l.facility_id = ${facilityId}` : sql``;
  const movementJoin = facilityId
    ? sql`left join locations fl on fl.id = m.from_location_id left join locations tl on tl.id = m.to_location_id`
    : sql``;
  const movementInFacility = facilityId ? sql`and (fl.facility_id = ${facilityId} or tl.facility_id = ${facilityId})` : sql``;

  const rows = (await db.execute(sql`
    with qty as (
      select s.item_id, sum(s.quantity)::int as quantity
      from stock s
      ${stockJoin}
      join items i on i.id = s.item_id
      where i.organization_id = ${organizationId}
      group by s.item_id
    ),
    mv as (
      select m.item_id,
        coalesce(sum(m.quantity) filter (where m.reason in (${reasonList}) and m.created_at >= ${since.toISOString()}::timestamp), 0)::int as outflow_window,
        max(m.created_at) filter (where m.reason in (${reasonList})) as last_outflow_at,
        min(m.created_at) as first_seen_at
      from movements m
      ${movementJoin}
      where m.organization_id = ${organizationId} ${movementInFacility}
      group by m.item_id
    )
    select i.id as item_id, i.name, i.sku, i.category, i.unit_of_measure,
      i.min_stock_level, i.max_stock_level, i.warn_days,
      coalesce(qty.quantity, 0)::int as quantity,
      coalesce(mv.outflow_window, 0)::int as outflow_window,
      mv.last_outflow_at, mv.first_seen_at
    from items i
    left join qty on qty.item_id = i.id
    left join mv on mv.item_id = i.id
    where i.organization_id = ${organizationId}
    order by i.name
  `)) as unknown as Row[];

  return rows.map((row) => {
    const dailyOutflow = dailyOutflowFor(row.outflow_window, r.consumptionWindowDays, asDate(row.first_seen_at), now);
    const lastOutflowAt = asDate(row.last_outflow_at);
    const { status, daysLeft } = stockStatus(
      {
        quantity: row.quantity,
        min: row.min_stock_level,
        max: row.max_stock_level,
        warnDays: row.warn_days,
        dailyOutflow,
        hasOutflowHistory: lastOutflowAt !== null,
      },
      r,
    );
    return {
      itemId: row.item_id,
      name: row.name,
      sku: row.sku,
      category: row.category,
      unitOfMeasure: row.unit_of_measure,
      min: row.min_stock_level,
      max: row.max_stock_level,
      warnDays: row.warn_days,
      quantity: row.quantity,
      outflowInWindow: row.outflow_window,
      dailyOutflow,
      lastOutflowAt,
      status,
      daysLeft,
    };
  });
}
