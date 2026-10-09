import "dotenv/config";
import { and, eq } from "drizzle-orm";
import { db } from "./index";
import { facilities, facilityLevels, items, locations, memberships, stock, users, type LocationKind } from "./schema";
import { bayCode, nextCode, ZONE_COLORS } from "@/lib/blueprint-types";
import { normalizeEmail } from "@/lib/email-normalize";

// Local-only QA fixture for big floors (#204): a 1000 × 500 m facility with
// eight zones and ~170 racks of 10 bays × 3 levels (~5 000 bins), about half
// of them stocked, added to the first organization of the given user (which
// gets twenty QA items if it has none).
// Re-running replaces that one facility.
//
//   pnpm db:seed:large                      # blerim@seed.smartdepo.test
//   pnpm db:seed:large someone@example.test

const FACILITY_NAME = "Depo QA 1000×500";
const FLOOR = { widthM: 1000, heightM: 500 };
const ZONES = { cols: 4, rows: 2, margin: 10 };
const RACK = { widthM: 27, heightM: 2.7, bays: 10, levels: 3, aisleM: 4, gapM: 6 };
const RACKS_PER_ZONE = { cols: 3, rows: 7 };

const dbHost = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? "").hostname;
  } catch {
    return "";
  }
})();
if (!["localhost", "127.0.0.1", "::1", "postgres"].includes(dbHost)) {
  console.error(`seed-large-floor refuses to run against "${dbHost || "(unset)"}" — local databases only.`);
  process.exit(1);
}

// Deterministic, so two runs give the same picture.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main() {
  const email = normalizeEmail(process.argv[2] ?? "blerim@seed.smartdepo.test");
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (!user) throw new Error(`No user ${email} — run pnpm db:seed:dev first, or pass an existing email.`);
  const [membership] = await db.select({ organizationId: memberships.organizationId }).from(memberships).where(eq(memberships.userId, user.id));
  if (!membership) throw new Error(`${email} belongs to no organization.`);
  const organizationId = membership.organizationId;

  const previous = await db.select({ id: facilities.id }).from(facilities).where(and(eq(facilities.organizationId, organizationId), eq(facilities.name, FACILITY_NAME)));
  for (const { id } of previous) {
    await db.delete(locations).where(eq(locations.facilityId, id));
    await db.delete(facilityLevels).where(eq(facilityLevels.facilityId, id));
    await db.delete(facilities).where(eq(facilities.id, id));
  }
  const [facility] = await db.insert(facilities).values({ organizationId, name: FACILITY_NAME, ...FLOOR }).returning();
  await db.insert(facilityLevels).values([1, 2, 3].map((index) => ({ facilityId: facility.id, index })));

  const codes: string[] = [];
  const binIds: string[] = [];
  const zoneW = (FLOOR.widthM - ZONES.margin * (ZONES.cols + 1)) / ZONES.cols;
  const zoneH = (FLOOR.heightM - ZONES.margin * (ZONES.rows + 1)) / ZONES.rows;

  for (let zr = 0; zr < ZONES.rows; zr++) {
    for (let zc = 0; zc < ZONES.cols; zc++) {
      const zoneBox = { xM: ZONES.margin + zc * (zoneW + ZONES.margin), yM: ZONES.margin + zr * (zoneH + ZONES.margin), widthM: zoneW, heightM: zoneH };
      const zoneCode = nextCode("zone", null, codes);
      codes.push(zoneCode);
      const [zone] = await db
        .insert(locations)
        .values({
          facilityId: facility.id, kind: "zone", name: `ZONA ${zoneCode}`, code: zoneCode,
          color: ZONE_COLORS[(zr * ZONES.cols + zc) % ZONE_COLORS.length], ...zoneBox,
        })
        .returning();

      for (let rr = 0; rr < RACKS_PER_ZONE.rows; rr++) {
        for (let rc = 0; rc < RACKS_PER_ZONE.cols; rc++) {
          const code = nextCode("rack", zoneCode, codes);
          codes.push(code);
          const [rack] = await db
            .insert(locations)
            .values({
              facilityId: facility.id, parentId: zone.id, kind: "rack", name: "RAFT", code,
              xM: zoneBox.xM + 12 + rc * (RACK.widthM + RACK.gapM),
              yM: zoneBox.yM + 14 + rr * (RACK.heightM * 2 + RACK.aisleM),
              widthM: RACK.widthM, heightM: RACK.heightM, bays: RACK.bays, levels: RACK.levels,
            })
            .returning();
          const rows: (typeof locations.$inferInsert)[] = [];
          for (let level = 1; level <= RACK.levels; level++) {
            for (let bay = 1; bay <= RACK.bays; bay++) {
              rows.push({
                facilityId: facility.id, parentId: rack.id, kind: "bin" as LocationKind, name: "BIN",
                code: bayCode(code, level, bay, RACK.levels), isBin: true, bays: 1, levels: 1, bay, level,
              });
            }
          }
          const bins = await db.insert(locations).values(rows).returning({ id: locations.id });
          binIds.push(...bins.map((b) => b.id));
        }
      }
    }
  }

  let itemIds = (await db.select({ id: items.id }).from(items).where(eq(items.organizationId, organizationId))).map((r) => r.id);
  if (itemIds.length === 0) {
    const created = await db
      .insert(items)
      .values(Array.from({ length: 20 }, (_, i) => ({ organizationId, name: `Artikull QA ${i + 1}`, unitOfMeasure: "copë", minStockLevel: 20 })))
      .returning({ id: items.id });
    itemIds = created.map((r) => r.id);
  }
  let stocked = 0;
  {
    const random = mulberry32(204);
    const stockRows = binIds
      .filter(() => random() < 0.5)
      .map((locationId) => ({ itemId: itemIds[Math.floor(random() * itemIds.length)], locationId, quantity: 1 + Math.floor(random() * 120) }));
    for (let i = 0; i < stockRows.length; i += 500) await db.insert(stock).values(stockRows.slice(i, i + 500));
    stocked = stockRows.length;
  }

  console.log(`${FACILITY_NAME}: ${codes.length} zones+racks, ${binIds.length} bins, ${stocked} stocked (${email})`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
