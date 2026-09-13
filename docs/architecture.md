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
- **Light theme only**, matching the source design exactly (it defines no dark-mode tokens).

### Drag-to-move/resize, and starter templates

Originally shipped numeric-fields-only ("precise metre input suits a blueprint tool"), then
added real mouse drag-to-move and drag-to-resize (a corner handle) alongside — not instead of
— the numeric inspector fields, after direct feedback that non-technical warehouse staff find
typing x/y coordinates unapproachable. Both input methods write through the same
`updateEntity` action, so they can never drift out of sync with each other.

Mechanics: a drag captures the pointer's start position and the entity's starting box once,
in a ref (not React state) at `mousedown` — every subsequent `mousemove` computes the new box
from that fixed origin plus the cursor delta, avoiding the stale-closure bugs that plague
naive drag implementations in React. A snap-to-0.25 m grid keeps positions tidy. Persisting
only fires on `mouseup`, and only if the box actually changed — a plain click starts and ends
a zero-distance "drag," and skipping the no-op save avoids a server round-trip on every single
selection click.

Real correctness gap this exposed: once dragging made moving something between zones a normal
action (not just a rare manual-coordinate edit), `updateEntity` needed to recompute which
zone's bounds a moved entity now falls in and update `parentId` accordingly — otherwise a rack
dragged from Zone A into Zone B would keep reporting to Zone A (wrong parent for occupancy
stats, and wrong cascade target on delete). Zones themselves are exempt — moving a zone
doesn't try to re-home its contents.

**Starter templates** address the "blank canvas is intimidating" half of the same feedback:
`buildTemplate()` in `blueprint-types.ts` generates a small set of entities (positions/sizes
as fractions of the facility's actual width/height, so it fits whatever floor size the user
already configured) for a company to land on and then adjust, rather than starting from
nothing. Applied via the same `createEntityAt` core used for normal manual placement — not a
separate insert path — so a templated zone is indistinguishable from a hand-drawn one. Offered
only on a genuinely empty floor, alongside the palette (never forced) so a confident user can
still just start drawing.

Bug caught by the template feature specifically (not something manual single-entity testing
had ever exercised): `nextCode()`'s sibling-counting used `startsWith(stem)`, which also
matched a sibling rack's own auto-generated bay children (`"A-01-1"` starts with `"A-"` too) —
inflating the count and skipping codes (a zone's second rack came out `"A-08"` instead of
`"A-02"`). Templates create multiple racks in one zone in quick succession, which surfaced it
immediately; fixed by requiring the remainder after the stem to be pure digits.

## Internationalization

**next-intl**, cookie-based (`NEXT_LOCALE`), no URL locale prefixes — this is a logged-in
tool, not a public site needing per-locale SEO, so `/sq/...` / `/en/...` routing would be
pure overhead. Default locale is **Albanian** (`sq`), the primary target market, with English
as the switch-to option via a header toggle. Messages live in `messages/en.json` and
`messages/sq.json`, organized by page/feature namespace.

Every static UI string and every user-facing server-action error/validation message is
translated (the latter via `getTranslations()` called server-side, so a thrown `Error`'s
`.message` is already in the caller's locale by the time the client displays it — no
client-side error-code mapping needed). Not translated, deliberately: anything the user
themselves typed (item names, location codes, facility names) — only the app's own chrome.

One deliberate design choice: a new location's auto-generated default `name` (e.g. "ZONË" vs
"ZONE") is resolved in the *creating user's current locale* and then stored as a normal
editable field — so it's immediately usable without the admin having to rename every object,
but it does **not** retroactively change if they later switch languages (same as any other
user-entered text). Location **codes** (e.g. `A-01`) are deliberately generated from a fixed,
locale-independent scheme regardless of UI language, since they're operational identifiers
that need to stay stable and predictable, not translated labels.

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
