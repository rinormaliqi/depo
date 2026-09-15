import assert from "node:assert/strict";
import { test } from "node:test";
import { addMonths, isBillingMonths, limitsExceeded, priceForPeriod } from "./billing-plans";

test("price is months × monthly with no discount", () => {
  assert.equal(priceForPeriod({ priceCents: 21900 }, 1), 21900);
  assert.equal(priceForPeriod({ priceCents: 21900 }, 12), 262800);
});

test("only the offered periods are accepted", () => {
  assert.ok(isBillingMonths(1) && isBillingMonths(3) && isBillingMonths(12));
  assert.ok(!isBillingMonths(2) && !isBillingMonths(0) && !isBillingMonths(-12));
});

test("addMonths lands on the same day-of-month when possible", () => {
  assert.equal(addMonths(new Date("2026-01-15T00:00:00Z"), 1).toISOString(), "2026-02-15T00:00:00.000Z");
  assert.equal(addMonths(new Date("2026-03-01T00:00:00Z"), 12).toISOString(), "2027-03-01T00:00:00.000Z");
});

test("limitsExceeded names every limit the usage is over, null meaning unlimited", () => {
  const starter = { maxUsers: 5, maxFacilities: 1, maxBins: 500 };
  assert.deepEqual(limitsExceeded(starter, { users: 5, facilities: 1, bins: 500 }), []);
  assert.deepEqual(limitsExceeded(starter, { users: 6, facilities: 1, bins: 700 }), ["users", "bins"]);
  assert.deepEqual(limitsExceeded({ maxUsers: null, maxFacilities: null, maxBins: null }, { users: 999, facilities: 9, bins: 99999 }), []);
});
