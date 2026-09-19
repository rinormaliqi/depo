// Minimal row builders for tests. Each returns ids only; anything a test
// asserts on it should read back itself.
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { facilities, items, locations, memberships, organizations, plans, users, type MembershipRole } from "@/db/schema";

export async function seedPlans() {
  const rows = [
    { key: "starter", name: "Starter", priceCents: 4900, maxUsers: 5, maxFacilities: 1, maxBins: 500, movementHistoryMonths: 12, features: { printLabels: true, cameraScanning: true, viewMetrics: true } },
    { key: "business", name: "Business", priceCents: 11900, maxUsers: 20, maxFacilities: 3, maxBins: 5000, movementHistoryMonths: 24, features: { printLabels: true, cameraScanning: true, viewMetrics: true } },
    { key: "enterprise", name: "Enterprise", priceCents: 24900, maxUsers: null, maxFacilities: null, maxBins: null, movementHistoryMonths: null, features: { printLabels: true, cameraScanning: true, viewMetrics: true } },
  ];
  for (const plan of rows) await db.insert(plans).values(plan).onConflictDoNothing({ target: plans.key });
  const all = await db.select().from(plans);
  return Object.fromEntries(all.map((p) => [p.key, p])) as Record<"starter" | "business" | "enterprise", (typeof all)[number]>;
}

// Random suffix: files share one test database, and a fixed sequence
// would collide on users.email the moment two files ran in one session.
let counter = 0;
const run = Math.random().toString(36).slice(2, 8);

export async function createUser(overrides: Partial<typeof users.$inferInsert> = {}) {
  counter += 1;
  const email = overrides.email ?? `user${counter}-${run}@example.com`;
  const [user] = await db
    .insert(users)
    .values({ email, normalizedEmail: email, name: `User ${counter}`, passwordHash: "x", emailVerifiedAt: new Date(), ...overrides })
    .returning();
  return user;
}

export async function createOrg(opts: { planKey?: "starter" | "business" | "enterprise"; status?: "trialing" | "active" | "past_due" | "canceled"; trialEndsAt?: Date | null; paidUntil?: Date | null } = {}) {
  const planRows = await seedPlans();
  const plan = planRows[opts.planKey ?? "business"];
  counter += 1;
  const [org] = await db
    .insert(organizations)
    .values({
      name: `Org ${counter}`,
      planId: plan.id,
      subscriptionStatus: opts.status ?? "trialing",
      trialEndsAt: opts.trialEndsAt === undefined ? new Date(Date.now() + 30 * 86400_000) : opts.trialEndsAt,
      paidUntil: opts.paidUntil ?? null,
    })
    .returning();
  const [facility] = await db.insert(facilities).values({ organizationId: org.id, name: "Main" }).returning();
  return { org, facility, plan };
}

export async function addMember(organizationId: string, role: MembershipRole, user?: typeof users.$inferSelect) {
  const u = user ?? (await createUser());
  await db.insert(memberships).values({ userId: u.id, organizationId, role });
  return u;
}

export async function createBin(facilityId: string, code: string) {
  const [bin] = await db.insert(locations).values({ facilityId, name: code, code, kind: "bin", isBin: true }).returning();
  return bin;
}

export async function createItem(organizationId: string, name = "Item") {
  const [item] = await db.insert(items).values({ organizationId, name, unitOfMeasure: "pcs" }).returning();
  return item;
}

export async function orgById(id: string) {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, id));
  return org;
}
