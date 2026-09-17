# Pricing — SmartDepo

## Policy
- **No permanent free tier.** Every active organization is either trialing or paying — avoids
  indefinite non-paying orgs consuming hosting/support time on a solo-run product.
- **30-day free trial**, no card required upfront. Chosen over a shorter (e.g. 14-day) trial
  because this product needs real setup work first (mapping a company's actual storage
  layout) before a company feels the payoff — a short trial risks expiring before they ever
  experience the "instant lookup" value.
- When a trial ends without a payment method, the organization moves to a locked/read-only
  state (data preserved, not deleted) rather than losing access to what they built.
- Positioning: **premium for the market**, not budget. The core paid tier was first drafted in
  the $150-300/mo band — B2B buyers tend to value "stop paying workers to walk around looking for
  things" well above what a founder instinctively prices it at.

## 2026-09-17: repriced for Kosovo — €49 / €119 / from €249

The original 99/219/449 draft assumed a generic Western SMB. The first real conversations are
Kosovo companies, and the founder's read is that 219/month reads as "enterprise software" to a
10–15-person depot there, not as a tool they'd buy on their own authority. Halving keeps the
same shape (Business is still the anchor, ~2.4× Starter; Enterprise is a negotiation floor) and
the economics still work: hosting is ~€14/month, Paysera takes 1%, so three Starter customers
cover costs. Prices are data (`src/db/seed.ts` upserts them), so this was a seed change plus a
re-run against production — no code change. Rule kept: never below €49, where B2B buyers stop
reading it as a solution and start reading it as a gadget. Raising later affects only new
purchases (terms: price changes never touch periods already paid).

## Tiers

| Tier | Price/mo | Users | Facilities | Bins | Movement history |
|---|---|---|---|---|---|
| Starter | €49 | 5 | 1 | 500 | 12 months |
| Business | €119 | 20 | 3 | 5,000 | 24 months |
| Enterprise | from €249 | unlimited | unlimited | unlimited | unlimited |

Business is the anchor tier — sized for the ~10-15 worker company that's the primary target
customer. Enterprise's price is a negotiable starting point, not a hard number, meant for
larger multi-site operations.

*Exact figures are a draft, not fixed (currency is EUR — see Billing v2) — revisit once there's real signal on
target-market willingness to pay (geography matters here: adjust if the initial customer base
turns out to be more price-sensitive than a generic SMB assumption).*

## Billing v2: prepaid periods through Paysera (v1 was manual activation)

v1 was the founder flipping plan/status by hand on `/internal` after a conversation — chosen
so the first customers could pay without weeks of checkout work. That path still exists (it's
now "record a bank transfer"), but there's a self-serve one next to it.

**Provider: Paysera, not Stripe.** Stripe doesn't onboard businesses registered in Kosovo;
Paysera does (it operates in Kosovo and Albania directly), takes cards and bank payments, and
its Checkout Classic protocol is a redirect plus one signed callback. Its *recurring* billing
is merchant-initiated (you store a card token and charge it yourself, under a separate
agreement), so rather than build a subscription engine the model is:

**Prepaid periods.** An admin picks a plan and 1 / 3 / 12 months on `/billing`, pays the total
up front on Paysera's hosted page, and `organizations.paid_until` moves forward by that many
months. Paying before the current period ends *extends* it; changing plan starts a fresh period
from now (no proration — the old period is simply superseded). Seven days before `paid_until`
(or the trial end) the admins get one reminder email; when it passes, the org drops into the
same read-only lockout as an expired trial until another period is bought. Enterprise is not
self-serve — it's "contact us" and activated on `/internal`. See `docs/architecture.md`'s
Billing section for the mechanics.

**Currency: EUR.** Kosovo uses the euro; the figures above are read as EUR (`BILLING_CURRENCY`
in `src/lib/billing-plans.ts`). Automatic card renewal via Paysera tokens is the obvious next
step once the Paysera agreement covers it; nothing in the prepaid model forecloses it.

## What's explicitly deferred
- **Discounted multi-month pricing.** 3- and 12-month periods exist but cost exactly months ×
  monthly; a discount is one change in `priceForPeriod()` once monthly pricing is validated.
- **Usage-based/overage pricing** (e.g. charging per bin beyond the plan limit instead of a
  hard cap). Hard limits are simpler to reason about and enforce for MVP.

## Enforcement
Limits are data (`plans.max_users`, `max_facilities`, `max_bins`), not hardcoded logic —
`src/lib/plan-limits.ts` compares live counts against the organization's plan before allowing
an action that would exceed it (e.g. adding a bin past `max_bins`). No separate schema needed
for that check. See `docs/architecture.md`'s "Plan-limit enforcement" section for where each
check is actually wired in — `max_facilities` has no call site yet, since nothing creates a
second facility until multi-facility switching exists.
