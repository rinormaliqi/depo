import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "./index";
import { plans, organizations, facilities } from "./schema";

const planRows: (typeof plans.$inferInsert)[] = [
  {
    key: "starter",
    name: "Starter",
    priceCents: 9900,
    maxUsers: 5,
    maxFacilities: 1,
    maxBins: 500,
    movementHistoryMonths: 12,
  },
  {
    key: "business",
    name: "Business",
    priceCents: 21900,
    maxUsers: 20,
    maxFacilities: 3,
    maxBins: 5000,
    movementHistoryMonths: 24,
  },
  {
    key: "enterprise",
    name: "Enterprise",
    priceCents: 44900,
    maxUsers: null,
    maxFacilities: null,
    maxBins: null,
    movementHistoryMonths: null,
  },
];

for (const plan of planRows) {
  await db.insert(plans).values(plan).onConflictDoNothing({ target: plans.key });
}

console.log("Seeded plans:", planRows.map((p) => p.key).join(", "));

// Demo org/facility — placeholder until auth exists to scope these per real signup.
const [businessPlan] = await db.select().from(plans).where(eq(plans.key, "business"));

let [org] = await db.select().from(organizations).limit(1);
if (!org) {
  [org] = await db
    .insert(organizations)
    .values({ name: "Demo Company", planId: businessPlan.id, subscriptionStatus: "trialing" })
    .returning();
  console.log("Seeded demo organization:", org.name);
}

let [facility] = await db
  .select()
  .from(facilities)
  .where(eq(facilities.organizationId, org.id));
if (!facility) {
  [facility] = await db
    .insert(facilities)
    .values({ organizationId: org.id, name: "Demo Warehouse" })
    .returning();
  console.log("Seeded demo facility:", facility.name);
}

process.exit(0);
