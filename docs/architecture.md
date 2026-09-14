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
- **No expiry/shelf-life tracking** — not in `items`/`stock`, a separate feature.
- **Light theme only**, matching the source design exactly (it defines no dark-mode tokens).

Multi-level shelving (`levels`) was cut in the first pass, then added back once the starter
templates needed to represent realistic pallet racking (see below) — a rack in most physical
depots is a metal frame with a ground level and an elevated platform above it at the same x/y
footprint, not a single flat shelf.

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

### Two-axis subdivision: bays × levels, and the level selector

A "store" location subdivides along two independent axes: `bays` (lateral position — always
existed) and `levels` (vertical/height tier — a rack's ground pallets vs. an elevated metal
platform above them at the same x/y footprint). Both live as explicit integer columns on
`locations`, plus `bay`/`level` on each auto-generated bin child, so a bays/levels resize can
tell "this exact cell already exists, preserve its stock" apart from "this cell is new"
without parsing the display `code` (which a user may have hand-edited) — see `reshapeGrid()`
in `src/app/builder/actions.ts`.

The critical UI constraint: **levels are invisible from a top-down floor plan.** Rendering
them as a second spatial grid axis would visually stretch a rack's real-world footprint,
which is wrong — a rack with 2 levels occupies the same floor rectangle as one with 1. Instead
the canvas toolbar grows a level selector (`ALL` / `1` / `2` / …) whenever any rendered entity
has more than one level; selecting a specific level filters which bay row each multi-level
entity draws (clamped to an entity's own top level if it has fewer), while `ALL` aggregates
occupancy across every level at that bay into one cell. A rack's on-canvas label also appends
its level count (`· 2L`) so the information isn't lost when viewing `ALL`.

Bin codes only spell out the level when there's more than one: `A-01-3` (single-level) vs.
`A-01-2-3` (level 2, bay 3) — see `bayCode()` in `blueprint-types.ts`. Resizing a rack's
levels across the 1 ⇄ >1 boundary renames its surviving children to match the new format,
rather than leaving a mix of old- and new-style codes.

### Full-depot starter templates

The original starter templates (`simple`, `yard`) were a sparse demo — a couple of racks in
one zone. Real feedback was that the default a new company lands on should look like an
actual depot: walled perimeter, multiple zones/sectors separated by aisles, and racks built as
two-level pallet racking by default (see above), not flat one-level shelving. `buildTemplate()`
now offers `depotVertical` and `depotHorizontal` — 4 zones (vertical strips or horizontal
bands, `buildDepot()` in `blueprint-types.ts`), each with 3 two-level, 6-bay racks, walled and
aisled — plus `simple` kept as a minimal option for a single small room. All positions still
scale as fractions of the facility's actual configured floor size.

### One scheme per subscription: persistent access + destructive-replace confirmation

Templates were originally offered once, on a genuinely empty floor. Once a facility can have
real stock committed to it, silently offering "start over" at any time is dangerous — a
misclick could discard a working layout. Two changes: a **Templates** button now lives
permanently in the builder sidebar (not just on an empty floor), and `applyTemplate()` takes an
explicit `replace: boolean` — calling it against a floor that already has locations without
`replace: true` throws a translated `confirmationRequired` error, which the client turns into a
confirmation dialog spelling out the actual constraint (a subscription gives one depot scheme;
replacing it discards the current one and can't be undone, though blank/other templates remain
always available). Confirming re-calls with `replace: true`. Either way, `checkNoStock()` still
runs first — a replace is never allowed to silently destroy real stock, confirmed or not; it
fails with `replaceHasStock` and the user has to clear the stock first.

### "Add sector": reflow existing zones to make room

`addSector()` (`src/app/builder/actions.ts`) adds one more top-level zone by shrinking the
existing ones to fit, rather than just dropping a new zone on top of whatever's already there.
`detectOrientation()` looks at whether existing zones are laid out more spread out
horizontally or vertically (comparing the spread of their centre-point coordinates), and
`computeZoneSlots()` computes N+1 evenly-sized boxes along that same axis. Each existing zone
is resized to its new slot, and `rescaleWithinZone()` applies the same affine transform (scale
+ offset, derived from old vs. new zone bounds) to reposition its direct children so racks
keep their relative position inside a now-narrower zone instead of spilling outside it.

Deliberately scoped to zones and their own direct children — an aisle or dock placed
independently of any zone is left where it is rather than attempting a full general-purpose
layout engine that reflows the whole floor. The new zone itself is created empty; a user fills
it from the palette like any other zone.

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

### Per-kind visual language

Every entity kind originally rendered as one of three generic looks (dashed area, hatched
fixture, plain white store box) — differentiated mostly by size, which meant the floor plan
didn't actually read as a depot to someone who wasn't already staring at the codes. Fixed by
giving each `LocationKind` its own look in `KIND_APPEARANCE` (`blueprint-canvas.tsx`), styled
after architectural drafting conventions rather than literal icons: racks get a light tint
with heavy end-posts (the steel uprights a real pallet rack bolts to), platforms a fine
crosshatch (a grated deck), pallets three horizontal bars (the classic top-down pallet
silhouette), bins a nested inset border (a container in its slot), docks an accent-tinted
hatch distinct from a wall's neutral one, and walls a solid dark poché fill — the one kind
that's genuinely impassable, so it's the one drawn solid instead of hollow. All CSS
(`repeating-linear-gradient`/`linear-gradient` background patterns, no images), so it costs
nothing extra to render and needs no new dependency. The same table drives the palette
swatches, so the palette doubles as a legend a new user learns while placing objects.

One follow-on fix this surfaced: a subdivided rack/platform's bay-grid cells painted opaque
white, which fully hid the kind's own pattern in exactly the case (multi-bay racks) where it
mattered most. Unoccupied bay cells now use a translucent wash instead of solid white so the
parent's pattern still reads through the grid; occupied cells stay opaque (`--color-accent-
200`) so "has stock" remains unambiguous at a glance.

### Search-to-highlight

The gap this closed: stock search results used to link to a text-only `/builder/bin/[id]`
page — a worker searching an item got a location *code* back, not a place on the floor plan
they'd actually recognize. Search results (`stock-search.tsx`) now link to `/builder?bin=<id>`
as their primary action; `/builder/bin/[id]` (stock add/remove) is still one tap away via a
secondary "Manage stock" link on the same result, so nothing already built was displaced.

`BlueprintCanvas` accepts `initialHighlightBinId` and, on load, walks the bin up to its
rendering parent (the rack/platform box the canvas actually draws — a bin itself is usually a
grid cell, not its own box), selects that parent, switches the level selector to the bin's
own level if it has more than one, scrolls the parent into view, and flashes the exact bay
cell for a few seconds — then drops the `?bin=` param via `router.replace` so a refresh
doesn't replay it. The flash (`.locate-ping` in `ds.css`) animates `transform`/`filter`
specifically because every other visual property (border, background, box-shadow, outline) is
already claimed by a box's own inline kind styling or selection ring, and inline style always
wins over a class.

Real bug this exposed, not from the design but from React's dev-only Strict Mode: the
highlight effect scheduled its "clear the flash" timer and marked itself consumed in the same
synchronous pass. Strict Mode double-invokes effects once on mount (mount → cleanup → mount)
to surface exactly this kind of bug — the first mount's cleanup canceled the timer, but since
the "consumed" flag had already flipped, the second (real) mount saw nothing to do and never
rescheduled it, leaving the flash stuck on permanently in development. Fixed by only marking
the highlight consumed *inside* the timer callback once it actually fires, not synchronously
in the effect body — both Strict Mode passes now schedule fresh timers safely, and once one
of them actually completes, later unrelated reloads correctly stop re-triggering the highlight.

### Undo/redo, copy/paste, delete

A client-side stack of inverse-operation pairs (`undo`/`redo` thunks), not a snapshot/restore
system — each pair is built from the same server actions the UI already calls, so it only
covers operations where "undo" has an unambiguous, safe meaning: create, delete, duplicate,
paste, move, resize, and field edits (name/code/dimensions/bays/levels) on one entity at a
time. `applyTemplate` and `addSector` touch many rows in one call and already carry their own
confirmation gate (or, for templates, an explicit "not reversible" warning) — rather than try
to make a many-row operation safely revertible, they simply clear undo/redo history, so a
stale entry never tries to patch a floor template-replace already rearranged.

Create/delete/duplicate/paste all make a *row* appear or disappear, and the server action
always mints a fresh id — so each of those undo entries closes over a mutable `liveId` that
gets reassigned every time the entry's own `undo`/`redo` runs, letting one entry keep
correctly referring to "this logical entity" across repeated undo/redo cycles even as its
underlying database id changes each time. Undoing a delete needed a way to recreate an entity
with its *exact* prior kind/box/bays/levels — not a kind's defaults, the same mistake
`duplicateEntity` had before this session's earlier fix — so `restoreEntity` was added as a
thin public wrapper around the same internal `createEntityAt` both `createEntity` and
`duplicateEntity` already use.

Keyboard handling lives in one `window` `keydown` listener, gated so it only fires when focus
isn't inside a text/number input or textarea (preserving native undo/copy/paste inside form
fields) and no dialog is open. Cmd/Ctrl+Z undoes, Shift adds redo (Cmd/Ctrl+Y also redoes);
Cmd/Ctrl+C copies the selected entity's id into an in-memory clipboard (not the system
clipboard — deliberately, so paste doesn't require Clipboard API permissions) unless there's
an active text selection on the page, in which case native text-copy is left alone; Cmd/Ctrl+V
pastes via the existing `duplicateEntity` action, cascading each repeated paste from the
previous one rather than always offsetting from the original; Delete/Backspace removes the
current selection. Small Undo/Redo buttons in the canvas toolbar mirror the shortcuts for
anyone not on a keyboard shortcut-friendly device.

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
