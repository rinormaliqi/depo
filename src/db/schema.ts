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
  jsonb,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const plans = pgTable("plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(), // 'starter' | 'business' | 'enterprise'
  name: text("name").notNull(),
  priceCents: integer("price_cents").notNull(),
  maxUsers: integer("max_users"), // null = unlimited
  maxFacilities: integer("max_facilities"),
  maxBins: integer("max_bins"),
  movementHistoryMonths: integer("movement_history_months"),
  // Feature entitlements as data, like the limits: { cameraScanning: true, … }.
  // Keys are the plan-gated capabilities in src/lib/capabilities.ts; a
  // missing key means "not included". Seeded in src/db/seed.ts.
  features: jsonb("features").$type<Record<string, boolean>>().notNull().default({}),
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
  // Billing is prepaid periods, not a running subscription (docs/pricing.md
  // "Billing v2"): each successful payment pushes this forward by the
  // months bought. Null while trialing. On an `active` org, null means
  // "paid indefinitely" — the founder's manual override on /internal.
  paidUntil: timestamp("paid_until"),
  // The paid_until (or trial_ends_at) value the last "expiring soon" email
  // was sent for — lets the lazy reminder in src/lib/billing-reminders.ts
  // send exactly one mail per period without a scheduler.
  expiryReminderSentFor: timestamp("expiry_reminder_sent_for"),
  stripeCustomerId: text("stripe_customer_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const paymentStatuses = ["pending", "paid", "failed", "canceled"] as const;
export type PaymentStatus = (typeof paymentStatuses)[number];

// One row per checkout attempt, whichever way the money moves: `paysera`
// rows are created when an admin clicks "Pay" on /billing and flipped to
// paid by the signed callback; `manual` rows are the founder recording a
// bank transfer on /internal. The row's id doubles as the Paysera
// `orderid`, so a callback maps back to exactly one attempt.
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id),
    months: integer("months").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull(),
    status: text("status", { enum: paymentStatuses }).notNull().default("pending"),
    provider: text("provider", { enum: ["paysera", "manual"] }).notNull(),
    // Paysera's own `requestid` from the callback, for support lookups.
    providerReference: text("provider_reference"),
    payerEmail: text("payer_email"),
    note: text("note"), // manual payments: "bank transfer 2026-09-15" etc.
    // Where paid_until stood before/after this payment applied — the
    // audit trail for "why does my access end on this date".
    periodStart: timestamp("period_start"),
    periodEnd: timestamp("period_end"),
    paidAt: timestamp("paid_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("payments_org_idx").on(table.organizationId)],
);

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
  // Bumped by "sign out everywhere": a JWT carrying an older number is
  // treated as signed out (src/lib/session.ts).
  sessionVersion: integer("session_version").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// A verified user changing their address: the new address must prove
// itself before it replaces the old one (a typo here would lock the
// account out), so the change is a pending row with a token mailed to the
// new inbox. Single-use, 24 hours, like a signup verification.
export const emailChanges = pgTable(
  "email_changes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    newEmail: text("new_email").notNull(),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    usedAt: timestamp("used_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("email_changes_user_idx").on(table.userId)],
);

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
// the invitee to already have an account. The /invite/<token> link is
// emailed on create and resend (src/app/team/actions.ts) and also shown
// on /team as a copyable fallback for teammates without a reliable inbox.
// acceptedAt null = still pending.
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
  // Structural fixtures — the building itself, not storage. Never hold
  // stock; they exist so the plan reads as the real space (where you get
  // in, where the columns are) before any racking is placed.
  "door",
  "exit",
  "window",
  "vent",
  "pillar",
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
    // Orientation of the *contents*, in quarter turns clockwise (0/90/180/
    // 270). The box itself (x/y/width/height) is always the real axis-aligned
    // footprint — rotating swaps width and height in place — so containment,
    // snapping and resizing never have to know about rotation; only the
    // drawing does: which way the bays run, which end bay 1 sits at, where a
    // rack's end-posts or a door's leaf line go.
    rotation: integer("rotation").notNull().default(0),
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
    // A SKU names one item within a company — what lets a bulk import
    // update the row it already created instead of adding a twin. Partial:
    // items without a SKU stay as many as the company likes.
    uniqueIndex("items_org_sku_idx")
      .on(table.organizationId, table.sku)
      .where(sql`${table.sku} is not null`),
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

// Messages from the public contact form. Kept as rows as well as sent as
// email: the row is the log if the mail fails, and the per-IP count in the
// last hour is the rate limit — no external anti-spam service.
export const contactMessages = pgTable(
  "contact_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    company: text("company"),
    email: text("email").notNull(),
    message: text("message").notNull(),
    ip: text("ip"),
    userId: uuid("user_id").references(() => users.id),
    sentAt: timestamp("sent_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("contact_messages_ip_idx").on(table.ip, table.createdAt)],
);

// The levels (heights) a facility's racks can have, as a list the admin
// manages: index 1..n, an optional custom name ("Dyshemeja", "Mezanina").
// A rack's `levels` count is how many of these it spans, from 1 up. Two
// per facility by default; docs/architecture.md "Facility levels".
export const facilityLevels = pgTable(
  "facility_levels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    facilityId: uuid("facility_id")
      .notNull()
      .references(() => facilities.id, { onDelete: "cascade" }),
    index: integer("index").notNull(),
    name: text("name"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("facility_levels_facility_index_idx").on(table.facilityId, table.index)],
);

// One row per counted attempt (a failed login, a reset request, a
// signup…) keyed by what's being limited — "login:email:x", "signup:ip:y".
// Postgres-backed like the contact-form cap so every serverless instance
// sees the same count; src/lib/rate-limit.ts counts a window and prunes.
export const rateLimitEvents = pgTable(
  "rate_limit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("rate_limit_events_key_idx").on(table.key, table.createdAt)],
);
