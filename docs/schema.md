# Database schema — SmartDepo

Postgres, every tenant-scoped table filtered by `organization_id`. Drizzle will be the ORM
(see architecture.md); this is the table-level sketch before writing actual Drizzle schema
files.

```
organizations
  id, name, created_at,
  plan_id → plans,
  subscription_status ('trialing' | 'active' | 'past_due' | 'canceled'),
  trial_ends_at (nullable timestamp),   -- null once converted to a paying plan
  stripe_customer_id (nullable text)    -- placeholder until billing is actually integrated

plans
  id, key ('starter' | 'business' | 'enterprise'), name,
  price_cents,                          -- monthly, USD cents
  max_users (nullable = unlimited),
  max_facilities (nullable = unlimited),
  max_bins (nullable = unlimited),      -- counts locations where is_bin = true
  movement_history_months (nullable = unlimited),
  is_active (boolean, default true),
  created_at

users
  id, email, password_hash (nullable if magic-link auth), name, created_at

memberships                            -- which orgs a user belongs to, with what role
  id, user_id → users, organization_id → organizations,
  role ('admin' | 'manager' | 'worker'), created_at

invites                                -- a pending seat, keyed by bearer token not account
  id, organization_id → organizations, email, role ('admin' | 'manager' | 'worker'),
  token (unique, random — the /invite/<token> link, no email is actually sent),
  invited_by → users, expires_at, accepted_at (nullable — null = still pending), created_at

facilities                             -- a company can have more than one physical site
  id, organization_id → organizations, name,
  width_m, height_m (real, default 40 × 24) -- floor envelope for the blueprint canvas
  created_at

locations                              -- the tree: zones/racks/shelves/bins, recursive,
  id, facility_id → facilities,        -- now with real spatial position for the blueprint
  parent_id → locations (nullable, null = top-level; cascades on delete),
  kind ('zone' | 'aisle' | 'rack' | 'platform' | 'pallet' | 'bin' | 'dock' | 'wall'),
  name,                                -- company-chosen label, e.g. "Zone A", "Rack 2"
  code (nullable text),                -- short label shown on the blueprint, e.g. "A-01"
  is_bin (boolean),                    -- true = leaf node that can actually hold stock
  x_m, y_m, width_m, height_m (real, metres) -- position + size on the blueprint canvas
  bays (integer, default 1),           -- lateral subdivision axis
  levels (integer, default 1),         -- vertical/height subdivision axis (mezzanine-style
                                        -- pallet racking) — invisible from the canvas's
                                        -- top-down view, shown one at a time via a level
                                        -- selector, never as a second spatial grid dimension
  bay, level (nullable integers),      -- grid position, set only on an auto-generated bin
                                        -- child (1-indexed) — lets a bays/levels resize tell
                                        -- "this cell already exists, keep its stock" apart
                                        -- from "this cell is new" without parsing `code`
  created_at

items                                  -- the catalog
  id, organization_id → organizations,
  name, sku (nullable), category (nullable), unit_of_measure,
  created_at

stock                                  -- current on-hand: item × bin × quantity (a snapshot,
  id, item_id → items,                 -- derivable from movements but kept live for fast
  location_id → locations (cascades on delete), -- search-to-locate lookups)
  quantity, updated_at
  UNIQUE (item_id, location_id)

movements                              -- append-only audit log — source of truth for stats
  id, organization_id → organizations, item_id → items,
  from_location_id → locations (nullable, null = external receipt; set null on delete),
  to_location_id → locations (nullable, null = consumed/disposed; set null on delete),
  quantity, reason ('receive' | 'pick' | 'relocate' | 'adjust'),
  performed_by → users, created_at
```

A `store`-kind location (rack/platform/pallet/bin) with `bays * levels > 1` is a pure shape
on the canvas (`is_bin = false`) with that many real `kind = 'bin'` child rows auto-generated
— not virtual string keys. A single-level location codes its children `A-01-1`..`A-01-8`; once
`levels > 1` the code spells out the level too (`A-01-1-1`..`A-01-2-8`) since it's no longer
implied. `bays = 1 && levels = 1` means the location itself is the leaf (`is_bin = true`).
A location's `parent_id` is set to whichever `zone` location's bounding box contains its
centre point at creation/placement time, computed once and persisted rather than recomputed
on every read.

Resizing `bays`/`levels` diffs the existing bin children against the new grid by their
explicit `bay`/`level` columns (not by parsing `code`, which a user may have hand-edited):
cells outside the new range are deleted (blocked if any holds stock), cells inside it are kept
and renamed if the single-level/multi-level code format changed, and missing cells are
inserted fresh.

## Indexes that matter
- `organization_id` on every tenant-scoped table — every query filters on it.
- `locations.parent_id` — tree traversal (recursive CTE).
- `items.name` — search-to-locate is the highest-frequency query in the product.
- `stock (item_id, location_id)` unique — prevents double-counting the same item/bin pair.

## Notes
- `locations.is_bin = true` is the only place stock can attach — enforced at the app layer
  (or a check constraint later) rather than a separate `bins` table, since a bin is just a
  location with no children.
- Plan limits (`plans.max_users` etc.) are compared against live row counts at write time —
  no additional schema needed to enforce them.
- Full pricing rationale lives in pricing.md; this file is the technical shape only.
