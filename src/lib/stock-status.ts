// An item's stock status (#217, #218): one of five, from how much there is,
// the thresholds an admin set, and how fast it has been used up lately.
// Pure — no database — so every screen (stock list, map, metrics) gets the
// same answer from the same numbers, and the rules are unit-tested here.

export type StockStatus = "out" | "low" | "draining" | "ok" | "over";

// Most urgent first: what a "needs attention" list sorts by.
export const STOCK_STATUS_ORDER: readonly StockStatus[] = ["out", "low", "draining", "over", "ok"];

export type InventoryRules = {
  /** Days of movements the consumption rate is averaged over. */
  consumptionWindowDays: number;
  /** Reaching the minimum within this many days makes an item "draining". */
  warnCoverDays: number;
  /** With no consumption history, "draining" means below min × this. */
  fallbackWarnRatio: number;
  /** Movement reasons that count as stock being used up. */
  outflowReasons: string[];
};

export const DEFAULT_INVENTORY_RULES: InventoryRules = {
  consumptionWindowDays: 30,
  warnCoverDays: 14,
  fallbackWarnRatio: 1.5,
  outflowReasons: ["sale", "pick", "remove"],
};

export type StockStatusInput = {
  quantity: number;
  /** At or below: "low". Null: no minimum, so never low or draining. */
  min: number | null;
  /** Above: "over". Null: no ceiling. */
  max: number | null;
  /** Units used per day over the window (0 when nothing went out). */
  dailyOutflow: number;
  /** Whether the item has ever been used up at all — without that, the rate
   *  says nothing yet and the fallback band applies. */
  hasOutflowHistory: boolean;
  /** The item's own warn days, overriding the company's. */
  warnDays?: number | null;
};

export type StockStatusResult = {
  status: StockStatus;
  /** At the current rate, roughly how many days until it runs out; null when
   *  nothing is being used up. */
  daysLeft: number | null;
};

export function stockStatus(input: StockStatusInput, rules: InventoryRules = DEFAULT_INVENTORY_RULES): StockStatusResult {
  const { quantity, min, max, dailyOutflow, hasOutflowHistory } = input;
  const rate = dailyOutflow > 0 ? dailyOutflow : 0;
  const daysLeft = rate > 0 ? Math.max(0, quantity) / rate : null;
  const result = (status: StockStatus) => ({ status, daysLeft });

  if (quantity <= 0) return result("out");
  if (max !== null && quantity > max) return result("over");
  if (min === null) return result("ok");
  if (quantity <= min) return result("low");

  const warnDays = input.warnDays ?? rules.warnCoverDays;
  if (rate > 0) {
    // Days until the minimum, not until zero: by then it is already "low".
    return result((quantity - min) / rate <= warnDays ? "draining" : "ok");
  }
  // Nothing went out in the window. If it never has, the rate tells us
  // nothing, so a fixed band stands in; if it has, it simply isn't moving.
  if (!hasOutflowHistory && quantity < min * rules.fallbackWarnRatio) return result("draining");
  return result("ok");
}

// The average daily use over the window — but an item that only appeared
// part-way through is averaged over the days it has existed (at least one),
// or a week-old item would look four times slower than it is.
export function dailyOutflowFor(outflowInWindow: number, windowDays: number, firstSeenAt: Date | null, now: Date = new Date()) {
  if (outflowInWindow <= 0) return 0;
  const ageDays = firstSeenAt ? (now.getTime() - firstSeenAt.getTime()) / 86_400_000 : windowDays;
  const days = Math.max(1, Math.min(windowDays, ageDays));
  return outflowInWindow / days;
}
