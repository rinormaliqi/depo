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

facilities                             -- a company can have more than one physical site
  id, organization_id → organizations, name, created_at

locations                              -- the tree: zones/racks/shelves/bins, recursive
  id, facility_id → facilities,
  parent_id → locations (nullable, null = top-level),
  name,                                -- company-chosen label, e.g. "Zone A", "Rack 2"
  is_bin (boolean),                    -- true = leaf node that can actually hold stock
  created_at

items                                  -- the catalog
  id, organization_id → organizations,
  name, sku (nullable), category (nullable), unit_of_measure,
  created_at

stock                                  -- current on-hand: item × bin × quantity (a snapshot,
  id, item_id → items,                 -- derivable from movements but kept live for fast
  location_id → locations,             -- search-to-locate lookups)
  quantity, updated_at
  UNIQUE (item_id, location_id)

movements                              -- append-only audit log — source of truth for stats
  id, organization_id → organizations, item_id → items,
  from_location_id → locations (nullable, null = external receipt),
  to_location_id → locations (nullable, null = consumed/disposed),
  quantity, reason ('receive' | 'pick' | 'relocate' | 'adjust'),
  performed_by → users, created_at
```

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
