# Backlog — deferred on purpose

Everything the docs have decided *not* to build yet, in one place, so "yes, we know, later"
has somewhere to point. Nothing here is a commitment; the order inside each group is rough
priority, and the note after each item says what it would take or what unblocks it. Revisit
against real customer usage, not against this list. (Tracked as GitHub issue #16.)

Last reconciled with the code: 2026-09-18.

## Product (from `docs/concept.md`, "Explicitly out of scope for MVP")

- **Per-item barcodes** as an optional layer on top of bin scanning — for products that
  already carry a manufacturer code. The bin-first data model doesn't change; the scanner
  would resolve a non-label code to an item instead of a location. `resolveScan()` already
  passes unknown codes through, so the hook is there.
- **Low-stock / reorder threshold alerts** — needs a per-item threshold column and a place to
  deliver alerts (the billing-reminder email path is the obvious one).
- **Stock valuation / cost accounting / export to accounting software** — quantities only
  today, no monetary fields anywhere.
- **Cross-facility transfers and facility-level rollups** — facilities exist and switch (#30);
  a relocate that crosses facilities and metrics across them do not.
- **ERP integrations / API + webhooks** — no public API; everything is server actions.
- **"Optimal placement" suggestions** from movement-frequency analytics.
- **Offline mode** for the scanner — would need a service worker and a queued-movement
  model; the current commit path is one server action per scan.
- **Native iOS/Android apps** — the responsive web app is the phone app; camera scanning
  works in the browser (#11), which removed the strongest reason to go native.
- **To-scale / freehand / 3D floor plans** — the builder is boxes on a grid by design.
- **RFID** — no hardware for MVP; the data model doesn't preclude it (a tag is just another
  code that resolves to a location or item).

## Billing (from `docs/pricing.md`)

- **Automatic card renewal** via Paysera card tokens — needs the separate merchant-initiated
  agreement with Paysera; the prepaid model doesn't foreclose it.
- **Discounted 3- and 12-month periods** — one change in `priceForPeriod()` once monthly
  pricing is validated with real customers.
- **Usage-based / overage pricing** instead of hard caps.
- **Enterprise self-serve** — stays "contact us" + `/internal` activation on purpose.

## Architecture (from `docs/architecture.md`)

- **Postgres row-level security** as a second line behind app-level org scoping — the
  isolation tests (#33) are the current guarantee.
- **Monorepo split** — only if a second real deployable appears (a public API, a native app).
- **Item photos** — Cloudflare R2 when needed; nothing stores blobs today.
- **Background job queue** — billing reminders run on request; a real scheduler only if a
  job appears that can't.
- **Email from an owned domain via Resend** — Gmail SMTP is the bridge until the domain
  exists (#7).
- **Bays × levels beyond 48 × 4** — the builder caps rack subdivision at what a label sheet
  and a phone screen handle; larger racks are modelled as two.

## Not deferred any more (moved out of this list)

- Pricing model — decided, see `docs/pricing.md` (€49 / €119 / from €249, prepaid).
- Printable QR labels — shipped (#10).
- Camera scanning — shipped (#11).
- Multi-facility switching and creation — shipped (#30); transfers/rollups still above.
- `max_facilities` enforcement — wired into `createFacility` since #30.
