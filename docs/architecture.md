# Architecture — SmartDepo

Guiding rule: this is a personal project on a personal budget. Every choice below is made to
minimize real monthly cost and avoid surprise bills, not to maximize scalability headroom we
don't need yet. Prefer boring, cheap, well-understood technology over anything that adds a
paid service before it's earned its keep.

## App shape: one deployable, not three

tender-ai runs `web` + `admin` + `api` as separate apps in a pnpm monorepo. SmartDepo does
**not** need that split — there's one developer and no reason to pay for/operate a separate
backend service yet.

**One Next.js app** (App Router), TypeScript, containing:
- UI routes for the visual builder, item search, dashboards
- Route Handlers / Server Actions in the same codebase acting as the "API"
- No separate Express/Fastify service, no separate admin app

This directly removes a whole deployable (and its hosting cost) compared to tender-ai's
structure. A monorepo split can happen later if a second real deployable (e.g. a public
marketing site) actually shows up — not before.

## Data layer

- **Postgres**, single database, multi-tenant via an `organization_id` column scoped in every
  query (row-level scoping in app code; Postgres RLS is a hardening option for later, not
  MVP).
- **Location tree:** plain adjacency list (`locations.parent_id`), queried with a recursive
  CTE. Handles thousands of nodes per company with no special extension. Explicitly rejected:
  `ltree`, nested sets, closure tables — solving a scale problem this product doesn't have.
- **ORM:** Drizzle (same as tender-ai — zero new learning curve, works fine on a normal
  Postgres instance, no vendor lock-in).
- **Stock model:** `item + bin (leaf location) + quantity`, plus an append-only `movements`
  table (who/what/from/to/qty/reason/timestamp) as the source of truth for "current location"
  and for stats.

## Auth

**Auth.js (NextAuth)**, users table in the same Postgres database. Rejected: Keycloak
(tender-ai's choice) — it needs its own JVM process plus its own database, which either needs
a bigger box or a second managed service. Auth.js adds zero infrastructure.

Roles (Admin / Manager / Worker) are a column on the user-organization membership, checked in
route handlers/middleware — no external authorization service.

## QR codes

Not implemented yet. The Scanner page (below) currently takes a typed location `code`
instead of a camera scan — real QR/barcode scanning is deferred, not abandoned. When it's
built: generated on request with the `qrcode` npm package (SVG/PNG for printing), nothing
persisted — no blob storage needed. If item photos are added later, use Cloudflare R2 (zero
egress fees) over Azure Blob (tender-ai's choice, which bills per download — bad fit for
something phones fetch repeatedly).

## Visual builder — the Depot Blueprint import

Superseded the original "boxes nested inside boxes" drill-down builder: a Claude Design
project (`Depot Blueprint.dc.html`) was imported and re-implemented as a real, spatial 2D
floor-plan canvas — zones/racks/platforms/pallets/bins/docks/walls positioned by `x/y/width/
height` in metres, not a text tree. Brought over from the design: the full visual language
(Barlow/Barlow Condensed, the ink-blue "blueprint" palette in `src/app/ds.css`, hairline
corner-bracket cards), the four-tab structure (Blueprint / Stock / Metrics / Scanner), and
real bay subdivision (a rack with 8 bays becomes 8 actual `locations` rows, not virtual
string keys like the source design used).

Deliberately cut from the source design, to keep this a schema-realistic first pass rather
than a wholesale rebuild:
- **No multi-level shelving** (`levels`) — bays only, one subdivision axis.
- **No expiry/shelf-life tracking** — not in `items`/`stock`, a separate feature.
- **No freehand mouse drag-to-move/resize** — numeric fields in the inspector instead. Precise
  metre input suits a blueprint tool and avoids a drag-engine's usual bug surface for a first
  pass.
- **Light theme only**, matching the source design exactly (it defines no dark-mode tokens).

No canvas/diagramming library (Konva, React Flow, etc.) — plain absolutely-positioned React
elements are enough for boxes-on-a-grid and keep bundle size down.

## Background jobs

None for MVP. No AI calls, no heavy async processing yet — a queue (pg-boss, used in
tender-ai) is a cost/complexity to add only once something concrete needs it.

## Hosting

| Service | Choice | Cost |
|---|---|---|
| App (Next.js) | Render Web Service, Starter — git-push deploys, always-on, no Dockerfile required | $7/mo |
| Database | Render Postgres, Starter — same dashboard/bill, automatic daily backups | $6/mo |
| Domain | Any registrar | ~$1/mo amortized |
| TLS | Automatic (Render) | $0 |
| Errors | Sentry free tier (5k events/mo) | $0 |
| **Total** | | **~$14/mo flat** |

### Why Render over the alternatives considered
- **Vercel Hobby + Neon/Supabase free:** $0/mo, but Hobby tier's terms expect commercial
  projects to upgrade to Pro ($20/mo), and free-tier Postgres can cold-start/pause —
  directly undermines the product's core promise of an instant answer for a worker on the
  floor, especially bad if it happens during a pilot-customer demo.
- **Self-hosted VPS (Hetzner, ~$5/mo):** cheapest option and reuses tender-ai's Docker
  Compose pattern, but requires self-managed backups/OS updates. Ruled out per explicit
  preference: pay a bit more, avoid server maintenance.
- **Railway/Fly.io:** usage-based billing — can be cheaper at near-zero traffic, but harder to
  predict as real usage shows up, which is the exact surprise-bill risk being avoided here.
- **Render (chosen):** flat per-service pricing, always-on (no cold starts), managed backups,
  automatic TLS, commercial use is fine on paid tiers, single dashboard/bill for app + DB.

### Decision log (locked in)
- One Next.js app, not three — no separate API/admin service
- Postgres + adjacency-list tree + Drizzle
- Auth.js, not Keycloak
- On-demand QR generation, no blob/object storage for MVP
- Plain React for the visual builder, no canvas library
- No background job queue for MVP
- Hosting: Render (app + Postgres), ~$14/mo flat, chosen over self-hosted VPS because the
  user prefers managed/no server maintenance and is willing to pay a bit more for it
