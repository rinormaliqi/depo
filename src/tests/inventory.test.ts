import { freshDatabase } from "@/test-support/setup";
import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { ownerDb as db } from "@/test-support/owner-db";
import { facilities, inventorySettings, items, movements, stock } from "@/db/schema";

import { DEFAULT_INVENTORY_RULES } from "@/lib/stock-status";
import { addMember, createBin, createOrg } from "@/test-support/factories";
import { getInventoryRules, getItemStockStatuses } from "@/test-support/in-company";

const NOW = new Date("2026-10-13T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

// #218: statuses computed from the database — quantities per facility or for
// the whole company, consumption from the movement log, company rules.
describe("getItemStockStatuses", () => {
  let org: Awaited<ReturnType<typeof createOrg>>;
  let other: Awaited<ReturnType<typeof createOrg>>;
  let userId: string;
  let binA: Awaited<ReturnType<typeof createBin>>;
  let binB: Awaited<ReturnType<typeof createBin>>;
  let facilityB: string;
  const ids: Record<string, string> = {};

  async function item(name: string, min: number | null, max: number | null, organizationId = org.org.id) {
    const [row] = await db.insert(items).values({ organizationId, name, unitOfMeasure: "copë", minStockLevel: min, maxStockLevel: max }).returning();
    ids[name] = row.id;
    return row;
  }
  async function put(itemName: string, locationId: string, quantity: number) {
    await db.insert(stock).values({ itemId: ids[itemName], locationId, quantity });
  }
  async function moved(itemName: string, reason: "receive" | "sale" | "pick" | "remove" | "relocate", quantity: number, at: Date, fromLocationId: string | null, toLocationId: string | null = null) {
    await db.insert(movements).values({ organizationId: org.org.id, itemId: ids[itemName], reason, quantity, createdAt: at, fromLocationId, toLocationId, performedBy: userId });
  }

  before(async () => {
    await freshDatabase();
    org = await createOrg();
    other = await createOrg();
    userId = (await addMember(org.org.id, "admin")).id;
    binA = await createBin(org.facility.id, "A-1");
    const [fb] = await db.insert(facilities).values({ organizationId: org.org.id, name: "B" }).returning();
    facilityB = fb.id;
    binB = await createBin(facilityB, "B-1");

    // Out: none anywhere.
    await item("Out", 10, null);
    // Low: 15 ≤ min 20.
    await item("Low", 20, 200); await put("Low", binA.id, 15);
    // Draining: 100 with min 20, 300 sold over the last 30 days → 10/day → 8 days to min.
    await item("Draining", 20, 200); await put("Draining", binA.id, 100);
    await moved("Draining", "receive", 400, daysAgo(60), null, binA.id);
    await moved("Draining", "sale", 150, daysAgo(20), binA.id);
    await moved("Draining", "pick", 150, daysAgo(5), binA.id);
    // Outside the window, and a relocate: neither counts as consumption.
    await moved("Draining", "sale", 999, daysAgo(45), binA.id);
    await moved("Draining", "relocate", 500, daysAgo(2), binA.id, binA.id);
    // Ok: plenty, slow.
    await item("Ok", 20, 200); await put("Ok", binA.id, 150);
    await moved("Ok", "sale", 30, daysAgo(10), binA.id);
    // Over: 250 > max 200, split across both facilities.
    await item("Over", 20, 200); await put("Over", binA.id, 120); await put("Over", binB.id, 130);
    // Another company's item must never appear.
    await item("Foreign", 1, 2, other.org.id);
  });

  const byName = (list: Awaited<ReturnType<typeof getItemStockStatuses>>) => Object.fromEntries(list.map((s) => [s.name, s]));

  test("company-wide: one status per item, nothing from other companies", async () => {
    const s = byName(await getItemStockStatuses(org.org.id, { now: NOW }));
    assert.deepEqual(
      Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v.status])),
      { Out: "out", Low: "low", Draining: "draining", Ok: "ok", Over: "over" },
    );
    assert.equal(s.Draining.outflowInWindow, 300, "only sales/picks within 30 days");
    assert.equal(s.Draining.dailyOutflow, 10);
    assert.equal(s.Draining.daysLeft, 10);
    assert.equal(s.Over.quantity, 250);
  });

  test("per facility: only that floor's stock", async () => {
    const a = byName(await getItemStockStatuses(org.org.id, { facilityId: org.facility.id, now: NOW }));
    assert.equal(a.Over.quantity, 120);
    assert.equal(a.Over.status, "ok", "120 of the 250 are here: within max");
    const b = byName(await getItemStockStatuses(org.org.id, { facilityId: facilityB, now: NOW }));
    assert.equal(b.Draining.status, "out", "facility B holds none of it");
    assert.equal(b.Draining.outflowInWindow, 0, "its sales were from A");
  });

  test("the company's rules change the result", async () => {
    assert.deepEqual(await getInventoryRules(org.org.id), DEFAULT_INVENTORY_RULES, "no row: defaults");
    await db.insert(inventorySettings).values({ organizationId: org.org.id, warnCoverDays: 5, outflowReasons: ["sale"] });
    const s = byName(await getItemStockStatuses(org.org.id, { now: NOW }));
    // Only sales count now: 150 in 30 days → 5/day → 16 days to the minimum > 5.
    assert.equal(s.Draining.outflowInWindow, 150);
    assert.equal(s.Draining.status, "ok");
  });
});
