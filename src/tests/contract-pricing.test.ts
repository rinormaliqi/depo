import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { contractPriceBreakdown } from "@/lib/billing-plans";

// Epic #8: a 12-month contract pays for 10 months, not 12 — worked exactly
// as the request's own example: Business at €119/mo.
describe("contractPriceBreakdown", () => {
  test("Business €119/mo: €1,428 standard, €238 off, €1,190 due", () => {
    const b = contractPriceBreakdown({ priceCents: 11900 });
    assert.equal(b.monthlyPriceCents, 11900);
    assert.equal(b.standardTotalCents, 142800);
    assert.equal(b.discountCents, 23800);
    assert.equal(b.finalTotalCents, 119000);
    // 10 months at the monthly price, exactly.
    assert.equal(b.finalTotalCents, 11900 * 10);
  });

  test("scales with any monthly price, not just Business's current one", () => {
    const b = contractPriceBreakdown({ priceCents: 24900 });
    assert.equal(b.standardTotalCents, 298800);
    assert.equal(b.discountCents, 49800);
    assert.equal(b.finalTotalCents, 249000);
  });
});
