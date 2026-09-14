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
- Positioning: **premium**, not budget. The core paid tier is priced in the $150-300/mo band
  deliberately — B2B buyers tend to value "stop paying workers to walk around looking for
  things" well above what a founder instinctively prices it at.

## Tiers

| Tier | Price/mo | Users | Facilities | Bins | Movement history |
|---|---|---|---|---|---|
| Starter | $99 | 5 | 1 | 500 | 12 months |
| Business | $219 | 20 | 3 | 5,000 | 24 months |
| Enterprise | from $449 | unlimited | unlimited | unlimited | unlimited |

Business is the anchor tier — sized for the ~10-15 worker company that's the primary target
customer. Enterprise's price is a negotiable starting point, not a hard number, meant for
larger multi-site operations.

*Currency (USD) and exact figures are a draft, not fixed — revisit once there's real signal on
target-market willingness to pay (geography matters here: adjust if the initial customer base
turns out to be more price-sensitive than a generic SMB assumption).*

## Billing v1: manual activation, not Stripe

Turning a trialing org into a paying one is a person (the founder) looking at `/internal`
after an offline conversation and picking a plan/status — not a customer clicking "upgrade"
and a card getting charged. Chosen over building a full self-serve Stripe Checkout integration
because it's days of work instead of weeks, and the first handful of B2B customers are
realistically closed by a conversation anyway, not a self-serve checkout flow. Automate with
Stripe once there's repeat volume to justify it — `organizations.stripe_customer_id` stays a
placeholder column for that, and nothing about the manual path forecloses adding it later.

See `docs/architecture.md`'s Billing section for how `/internal` and `/billing` work.

## What's explicitly deferred
- **Annual billing / discounted yearly plans.** Can be added later as a non-breaking column
  (`price_cents_yearly`) once monthly pricing is validated.
- **Usage-based/overage pricing** (e.g. charging per bin beyond the plan limit instead of a
  hard cap). Hard limits are simpler to reason about and enforce for MVP.

## Enforcement
Limits are data (`plans.max_users`, `max_facilities`, `max_bins`), not hardcoded logic —
`src/lib/plan-limits.ts` compares live counts against the organization's plan before allowing
an action that would exceed it (e.g. adding a bin past `max_bins`). No separate schema needed
for that check. See `docs/architecture.md`'s "Plan-limit enforcement" section for where each
check is actually wired in — `max_facilities` has no call site yet, since nothing creates a
second facility until multi-facility switching exists.
