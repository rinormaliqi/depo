// Pure pricing rules — no database, safe to import from client
// components (the plan picker) as well as server code.

// Kosovo (and the wider region SmartDepo sells into) runs on the euro;
// docs/pricing.md's figures are read as EUR. One constant rather than a
// column because the product has exactly one price list.
export const BILLING_CURRENCY = "EUR";

// Prepaid periods a customer can buy in one go. No multi-month discount
// yet (docs/pricing.md defers annual pricing) — the price is months ×
// monthly, this list only decides which buttons /billing shows.
//
// Only 1 month goes through Paysera (see startCheckout) — 3 and 6 are a
// bank transfer the founder records manually on /internal, and 12 is a
// contract, not a checkout at all. This list is still every period a
// customer can pick; how each one is actually paid is decided per period
// in the UI, not by what's in this array.
export const BILLING_PERIODS = [1, 3, 6, 12] as const;
export type BillingMonths = (typeof BILLING_PERIODS)[number];
export const PAYSERA_MONTHS = 1 as const;
export const BANK_TRANSFER_MONTHS = [3, 6] as const;

export function isBillingMonths(n: number): n is BillingMonths {
  return (BILLING_PERIODS as readonly number[]).includes(n);
}

// The two tiers a customer can put themselves on. Enterprise is priced
// "from", negotiated per customer, and activated by the founder on
// /internal — never a self-serve checkout.
export const SELF_SERVE_PLAN_KEYS = ["starter", "business"] as const;

export function priceForPeriod(plan: { priceCents: number }, months: number) {
  return plan.priceCents * months;
}

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

// Which of a plan's limits the org already exceeds — used to refuse a
// downgrade (a 700-bin depot can't buy Starter's 500-bin cap and then be
// locked out of its own racks) and to explain why on /billing.
export type PlanLimits = { maxUsers: number | null; maxFacilities: number | null; maxBins: number | null };
export type Usage = { users: number; facilities: number; bins: number };

export function limitsExceeded(plan: PlanLimits, usage: Usage) {
  const over: ("users" | "facilities" | "bins")[] = [];
  if (plan.maxUsers != null && usage.users > plan.maxUsers) over.push("users");
  if (plan.maxFacilities != null && usage.facilities > plan.maxFacilities) over.push("facilities");
  if (plan.maxBins != null && usage.bins > plan.maxBins) over.push("bins");
  return over;
}

