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
  // The alias-collapsed form of `email` (see src/lib/email-normalize.ts):
  // `+tag` stripped, dots stripped for Gmail. Unique so `me+1@gmail.com`
  // and `me+2@gmail.com` can't each start their own 30-day trial — the
  // raw `email` column stays what we actually send mail to.
  normalizedEmail: text("normalized_email").notNull().unique(),
  passwordHash: text("password_hash"),
  name: text("name").notNull(),
  // Null until the user clicks a verification link (signup) or accepts an
  // invite (which proves the inbox the same way). A signup's org trial
  // doesn't start until this is set — see getOrgLockReason().
  emailVerifiedAt: timestamp("email_verified_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Same shape as passwordResets: single-use, time-boxed bearer token, but
// a 24-hour window instead of 1 hour — nothing is being taken over here,
// the link only proves the signup owns the inbox they typed.
export const emailVerifications = pgTable(
  "email_verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    usedAt: timestamp("used_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("email_verifications_user_idx").on(table.userId)],
);

// A short-lived, single-use token for self-serve password recovery —
// deliberately a much shorter window than invites.expiresAt (1 hour, not
// 7 days), since unlike an invite link an admin hands out on purpose, this
// one is only ever meant to be used once, immediately, by whoever it was
// actually emailed to. usedAt null = still redeemable.
export const passwordResets = pgTable(
  "password_resets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    usedAt: timestamp("used_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("password_resets_user_idx").on(table.userId)],
);

export const membershipRoles = ["admin", "manager", "worker"] as const;
export type MembershipRole = (typeof membershipRoles)[number];

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
    role: text("role", { enum: membershipRoles }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("memberships_user_org_idx").on(table.userId, table.organizationId),
    index("memberships_org_idx").on(table.organizationId),
  ],
);

// A pending seat on an org, keyed by a bearer token rather than requiring
// the invitee to already have an account. No email is actually sent for
// now — the inviting admin/manager copies the /invite/<token> link and
// shares it themselves (Slack, WhatsApp, whatever they already use) rather
// than this project standing up transactional email infrastructure before
// there's a single paying customer. acceptedAt null = still pending.
export const invites = pgTable(
  "invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role", { enum: membershipRoles }).notNull(),
    token: text("token").notNull().unique(),
    invitedBy: uuid("invited_by")
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp("expires_at").notNull(),
    acceptedAt: timestamp("accepted_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("invites_org_idx").on(table.organizationId)],
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

// Two subdivision axes: bays (lateral position) and levels (vertical tier —
// e.g. ground pallets vs. an elevated platform above them at the SAME x/y
// footprint). A "store" kind location with bays*levels > 1 has that many
// auto-generated kind='bin' children; with exactly 1 of each it holds stock
// directly. Levels are a height concept, invisible from the canvas's
// top-down view — the UI shows one level at a time via a level selector,
// never as a second spatial dimension on the floor.
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
    levels: integer("levels").notNull().default(1),
    // Grid position — set only on an auto-generated bin child (1-indexed),
    // null otherwise. Lets a bays/levels resize tell "this exact cell
    // already exists, preserve its stock" apart from "this cell is new"
    // without parsing the display code, which a user may have edited.
    bay: integer("bay"),
    level: integer("level"),
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
