import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { dailyOutflowFor, DEFAULT_INVENTORY_RULES, stockStatus, type StockStatusInput } from "@/lib/stock-status";

const base: StockStatusInput = { quantity: 100, min: 20, max: 200, dailyOutflow: 0, hasOutflowHistory: true };
const status = (over: Partial<StockStatusInput>, rules = DEFAULT_INVENTORY_RULES) => stockStatus({ ...base, ...over }, rules).status;

// #218: the five statuses and their edges.
describe("stockStatus", () => {
  test("nothing left is out, whatever the thresholds", () => {
    assert.equal(status({ quantity: 0 }), "out");
    assert.equal(status({ quantity: 0, min: null, max: null }), "out");
    assert.equal(status({ quantity: -3 }), "out");
  });

  test("above the maximum is over; at the maximum is not", () => {
    assert.equal(status({ quantity: 201 }), "over");
    assert.equal(status({ quantity: 200 }), "ok");
    assert.equal(status({ quantity: 10_000, max: null }), "ok", "no ceiling, never over");
  });

  test("at or below the minimum is low", () => {
    assert.equal(status({ quantity: 20 }), "low");
    assert.equal(status({ quantity: 1 }), "low");
    assert.equal(status({ quantity: 21 }), "ok");
  });

  test("no minimum means never low or draining", () => {
    assert.equal(status({ quantity: 1, min: null, dailyOutflow: 50 }), "ok");
  });

  test("draining: reaches the minimum within the warn days at the current rate", () => {
    // 100 − 20 = 80 above the minimum; at 6/day that's 13.3 days ≤ 14.
    assert.equal(status({ dailyOutflow: 6 }), "draining");
    // At 5/day, 16 days: still fine.
    assert.equal(status({ dailyOutflow: 5 }), "ok");
    // Exactly on the edge counts as draining.
    assert.equal(status({ dailyOutflow: 80 / 14 }), "draining");
  });

  test("an item's own warn days override the company's", () => {
    assert.equal(status({ dailyOutflow: 5, warnDays: 20 }), "draining");
    assert.equal(status({ dailyOutflow: 6, warnDays: 7 }), "ok");
  });

  test("with no history at all, the fallback band stands in for the rate", () => {
    assert.equal(status({ quantity: 29, hasOutflowHistory: false }), "draining", "29 < 20 × 1.5");
    assert.equal(status({ quantity: 30, hasOutflowHistory: false }), "ok");
    // History exists but nothing went out lately: simply not moving.
    assert.equal(status({ quantity: 29, hasOutflowHistory: true }), "ok");
  });

  test("company rules change the answer", () => {
    const rules = { ...DEFAULT_INVENTORY_RULES, warnCoverDays: 30, fallbackWarnRatio: 2 };
    assert.equal(status({ dailyOutflow: 3 }, rules), "draining", "80/3 = 26.7 ≤ 30");
    assert.equal(status({ quantity: 39, hasOutflowHistory: false }, rules), "draining", "39 < 40");
  });

  test("days left is until zero at the current rate, null when nothing goes out", () => {
    assert.equal(stockStatus({ ...base, dailyOutflow: 4 }).daysLeft, 25);
    assert.equal(stockStatus({ ...base, dailyOutflow: 0 }).daysLeft, null);
    assert.equal(stockStatus({ ...base, quantity: 0, dailyOutflow: 4 }).daysLeft, 0);
  });

  test("min equal to max: at it is low, above it over", () => {
    assert.equal(status({ min: 50, max: 50, quantity: 50 }), "low");
    assert.equal(status({ min: 50, max: 50, quantity: 51 }), "over");
  });
});

describe("dailyOutflowFor", () => {
  const now = new Date("2026-10-13T12:00:00Z");
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

  test("averages over the window", () => {
    assert.equal(dailyOutflowFor(300, 30, daysAgo(400), now), 10);
  });
  test("a young item is averaged over the days it has existed", () => {
    assert.equal(dailyOutflowFor(70, 30, daysAgo(7), now), 10);
  });
  test("at least one day, and zero when nothing went out", () => {
    assert.equal(dailyOutflowFor(12, 30, daysAgo(0.1), now), 12);
    assert.equal(dailyOutflowFor(0, 30, daysAgo(10), now), 0);
  });
});
