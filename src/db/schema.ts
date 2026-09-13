import {
  pgTable,
  uuid,
  text,
  integer,
  real,
  boolean,
  timestamp,
  uniqueIndex,
  index,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

export const plans = pgTable("plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(), // 'starter' | 'business' | 'enterprise'
  name: text("name").notNull(),
  priceCents: integer("price_cents").notNull(),
  maxUsers: integer("max_users"), // null = unlimited
  maxFacilities: integer("max_facilities"),
  maxBins: integer("max_bins"),
  movementHistoryMonths: integer("movement_history_months"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  planId: uuid("plan_id")
    .notNull()
    .references(() => plans.id),
  subscriptionStatus: text("subscription_status", {
    enum: ["trialing", "active", "past_due", "canceled"],
  })
    .notNull()
    .default("trialing"),
  trialEndsAt: timestamp("trial_ends_at"),
  stripeCustomerId: text("stripe_customer_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    role: text("role", { enum: ["admin", "manager", "worker"] }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("memberships_user_org_idx").on(table.userId, table.organizationId),
    index("memberships_org_idx").on(table.organizationId),
  ],
);

export const facilities = pgTable(
  "facilities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    widthM: real("width_m").notNull().default(40), // floor envelope, metres
    heightM: real("height_m").notNull().default(24),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("facilities_org_idx").on(table.organizationId)],
);

// Single subdivision axis (bays) — no multi-level shelving yet. A "store" kind
// location with bays > 1 has that many auto-generated kind='bin' children;
// with bays = 1 it holds stock directly.
export const locationKinds = [
  "zone",
  "aisle",
  "rack",
  "platform",
  "pallet",
  "bin",
  "dock",
  "wall",
] as const;
export type LocationKind = (typeof locationKinds)[number];

export const locations = pgTable(
  "locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    facilityId: uuid("facility_id")
      .notNull()
      .references(() => facilities.id),
    parentId: uuid("parent_id").references((): AnyPgColumn => locations.id, {
      onDelete: "cascade",
    }),
    kind: text("kind", { enum: locationKinds }).notNull().default("bin"),
    name: text("name").notNull(),
    code: text("code"), // short label shown on the blueprint, e.g. "A-01"
    isBin: boolean("is_bin").notNull().default(false),
    xM: real("x_m").notNull().default(0), // position + size, metres
    yM: real("y_m").notNull().default(0),
    widthM: real("width_m").notNull().default(1),
    heightM: real("height_m").notNull().default(1),
    bays: integer("bays").notNull().default(1),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("locations_facility_idx").on(table.facilityId),
    index("locations_parent_idx").on(table.parentId),
    index("locations_code_idx").on(table.facilityId, table.code),
  ],
);

export const items = pgTable(
  "items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    sku: text("sku"),
    category: text("category"),
    unitOfMeasure: text("unit_of_measure").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("items_org_idx").on(table.organizationId),
    index("items_name_idx").on(table.name),
  ],
);

export const stock = pgTable(
  "stock",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull().default(0),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("stock_item_location_idx").on(table.itemId, table.locationId),
    index("stock_location_idx").on(table.locationId),
  ],
);

export const movements = pgTable(
  "movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id),
    fromLocationId: uuid("from_location_id").references(() => locations.id, {
      onDelete: "set null",
    }),
    toLocationId: uuid("to_location_id").references(() => locations.id, {
      onDelete: "set null",
    }),
    quantity: integer("quantity").notNull(),
    reason: text("reason", {
      enum: ["receive", "pick", "relocate", "adjust"],
    }).notNull(),
    performedBy: uuid("performed_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("movements_org_idx").on(table.organizationId)],
);
