import "dotenv/config";
import { db } from "./index";
import { plans } from "./schema";

const planRows: (typeof plans.$inferInsert)[] = [
  {
    key: "starter",
    name: "Starter",
    priceCents: 4900,
    maxUsers: 5,
    maxFacilities: 1,
    maxBins: 500,
    movementHistoryMonths: 12,
  },
  {
    key: "business",
    name: "Business",
    priceCents: 11900,
    maxUsers: 20,
    maxFacilities: 3,
    maxBins: 5000,
    movementHistoryMonths: 24,
  },
  {
    key: "enterprise",
    name: "Enterprise",
    priceCents: 24900,
    maxUsers: null,
    maxFacilities: null,
    maxBins: null,
    movementHistoryMonths: null,
  },
];

// Upsert, not insert-if-missing: the seed is the price list's source of
// truth, so re-running it after a price change updates the live rows.
// Limits are updated too. Existing orgs keep their plan row (same id);
// what changes is what the next payment costs.
for (const plan of planRows) {
  const { key, ...rest } = plan;
  await db.insert(plans).values(plan).onConflictDoUpdate({ target: plans.key, set: rest });
}

console.log("Seeded plans:", planRows.map((p) => p.key).join(", "));
process.exit(0);
