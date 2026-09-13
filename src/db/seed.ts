import "dotenv/config";
import { db } from "./index";
import { plans } from "./schema";

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
process.exit(0);
