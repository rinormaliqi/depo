import "dotenv/config";
import { hash } from "bcryptjs";
import { inArray, like } from "drizzle-orm";
import { db } from "./index";
import {
  facilities,
  facilityLevels,
  invites,
  items,
  locations,
  memberships,
  movements,
  organizations,
  payments,
  plans,
  stock,
  users,
  type LocationKind,
  type MembershipRole,
} from "./schema";
import { bayCode, buildTemplate, findContainingZone, LOCATION_TYPES, nextCode, type TemplateKey } from "@/lib/blueprint-types";
import { normalizeEmail } from "@/lib/email-normalize";

// Local-only test dataset: a dozen users across six companies, one per
// plan/state combination the app distinguishes, each with a laid-out
// facility, an item catalogue, stock and a movement history — so every
// feature can be exercised by logging in as the right person instead of
// clicking a company together by hand. Not the price-list seed
// (src/db/seed.ts — run that first); never run this against production.
//
// Re-runnable: everything it created last time (recognised by the
// @seed.smartdepo.test address) is deleted and rebuilt.

const SEED_DOMAIN = "seed.smartdepo.test";
const PASSWORD = "Test1234!";
const DAY = 86400_000;

type SeedUser = { email: string; name: string; role: MembershipRole };
type SeedFacility = { name: string; widthM: number; heightM: number; template: TemplateKey; fillPct: number };
type SeedOrg = {
  name: string;
  plan: "starter" | "business" | "enterprise";
  status: "trialing" | "active" | "past_due" | "canceled";
  trialEndsAt?: Date | null;
  paidUntil?: Date | null;
  users: SeedUser[];
  facilities: SeedFacility[];
  itemCount: number;
  catalogue: "construction" | "electro" | "pharma" | "auto" | "textile";
};

const now = Date.now();

const ORGS: SeedOrg[] = [
  {
    // Starter, mid-trial, one small floor — the "just signed up" company.
    name: "Gjirafa Depo",
    plan: "starter",
    status: "trialing",
    trialEndsAt: new Date(now + 21 * DAY),
    users: [
      { email: "arber", name: "Arbër Krasniqi", role: "admin" },
      { email: "lira", name: "Lira Berisha", role: "worker" },
    ],
    facilities: [{ name: "Depo Kryesore", widthM: 24, heightM: 16, template: "simple", fillPct: 0.5 }],
    itemCount: 20,
    catalogue: "electro",
  },
  {
    // Business, paid, two facilities, full team — the anchor customer.
    name: "Prishtina Ndërtim",
    plan: "business",
    status: "active",
    trialEndsAt: null,
    paidUntil: new Date(now + 180 * DAY),
    users: [
      { email: "blerim", name: "Blerim Gashi", role: "admin" },
      { email: "vjosa", name: "Vjosa Rexhepi", role: "manager" },
      { email: "driton", name: "Driton Morina", role: "worker" },
      { email: "egzon", name: "Egzon Shala", role: "worker" },
    ],
    facilities: [
      { name: "Depo Fushë Kosovë", widthM: 40, heightM: 24, template: "depotVertical", fillPct: 0.65 },
      { name: "Depo Graçanicë", widthM: 30, heightM: 20, template: "depotHorizontal", fillPct: 0.3 },
    ],
    itemCount: 150,
    catalogue: "construction",
  },
  {
    // Business trial, nearly over — the "7 days left" reminder case.
    name: "Ferizaj Elektro",
    plan: "business",
    status: "trialing",
    trialEndsAt: new Date(now + 5 * DAY),
    users: [
      { email: "fatos", name: "Fatos Hyseni", role: "admin" },
      { email: "elira", name: "Elira Zeqiri", role: "manager" },
    ],
    facilities: [{ name: "Magazina", widthM: 32, heightM: 20, template: "depotVertical", fillPct: 0.4 }],
    itemCount: 60,
    catalogue: "electro",
  },
  {
    // Starter whose trial ended without paying — read-only lockout.
    name: "Peja Farma",
    plan: "starter",
    status: "trialing",
    trialEndsAt: new Date(now - 3 * DAY),
    users: [{ email: "gent", name: "Gent Kelmendi", role: "admin" }],
    facilities: [{ name: "Depo Barnash", widthM: 20, heightM: 14, template: "simple", fillPct: 0.8 }],
    itemCount: 30,
    catalogue: "pharma",
  },
  {
    // Business that paid once and let it lapse — the "expired" lockout.
    name: "Mitrovica Auto",
    plan: "business",
    status: "active",
    trialEndsAt: null,
    paidUntil: new Date(now - 10 * DAY),
    users: [{ email: "besnik", name: "Besnik Ahmeti", role: "admin" }],
    facilities: [{ name: "Depo Pjesësh", widthM: 28, heightM: 18, template: "depotHorizontal", fillPct: 0.55 }],
    itemCount: 80,
    catalogue: "auto",
  },
  {
    // Enterprise, paid indefinitely (the /internal override), three sites.
    // Vjosa from Prishtina Ndërtim is also a manager here — the
    // organization switcher case.
    name: "Prizren Tekstil",
    plan: "enterprise",
    status: "active",
    trialEndsAt: null,
    paidUntil: null,
    users: [
      { email: "albulena", name: "Albulena Bytyqi", role: "admin" },
      { email: "kushtrim", name: "Kushtrim Thaçi", role: "worker" },
      { email: "vjosa", name: "Vjosa Rexhepi", role: "manager" },
    ],
    facilities: [
      { name: "Fabrika Prizren", widthM: 48, heightM: 30, template: "depotVertical", fillPct: 0.7 },
      { name: "Depo Suharekë", widthM: 30, heightM: 20, template: "depotHorizontal", fillPct: 0.45 },
      { name: "Dyqani Prishtinë", widthM: 16, heightM: 12, template: "simple", fillPct: 0.9 },
    ],
    itemCount: 200,
    catalogue: "textile",
  },
];

// ── Item catalogues ─────────────────────────────────────────────────────

const CATALOGUES: Record<SeedOrg["catalogue"], { prefix: string; categories: string[]; names: string[]; units: string[] }> = {
  construction: {
    prefix: "NDR",
    categories: ["Çimento", "Hekur", "Izolim", "Vegla", "Pllaka", "Ngjyra"],
    names: ["Çimento 50kg", "Hekur betoni Ø12", "Hekur betoni Ø16", "Stiropor 5cm", "Stiropor 10cm", "Rrjetë armimi", "Pllaka 60x60", "Pllaka 30x60", "Ngjyrë fasade 15L", "Ngjitës pllakash 25kg", "Gips 25kg", "Tullë 25cm", "Blloqe 20cm", "Rërë e imët", "Zhavorr", "Profil alumini", "Vida 4x40", "Vida 5x60", "Ankor 10mm", "Silikon 300ml", "Shirit izolues", "Membranë hidroizoluese", "Llaç 25kg", "Kova 20L", "Fshesë betoni"],
    units: ["thes", "copë", "m", "m²", "kg", "L", "paketë"],
  },
  electro: {
    prefix: "ELK",
    categories: ["Kabllo", "Ndriçim", "Prizat", "Siguresa", "Automatikë"],
    names: ["Kabllo 3x1.5", "Kabllo 3x2.5", "Kabllo 5x4", "Llambë LED 9W", "Llambë LED 12W", "Reflektor 50W", "Prizë e brendshme", "Prizë e jashtme", "Çelës i njëfishtë", "Çelës i dyfishtë", "Siguresë 16A", "Siguresë 25A", "Kuti shpërndarëse", "Tub PVC 16mm", "Tub PVC 20mm", "Kanal kabllosh 40x25", "Kontaktor 25A", "Rele kohor", "Termostat", "Sensor lëvizjeje", "Zgjatues 5m", "Shirit LED 5m", "Transformator 12V", "Bateri 9V", "Bateri AA"],
    units: ["m", "copë", "paketë", "rrotull"],
  },
  pharma: {
    prefix: "FRM",
    categories: ["Analgjezikë", "Antibiotikë", "Vitamina", "Higjienë", "Pajisje"],
    names: ["Paracetamol 500mg", "Ibuprofen 400mg", "Amoksicilinë 500mg", "Vitaminë C 1000mg", "Vitaminë D3", "Magnez", "Fasho sterile", "Leukoplast", "Dezinfektues 1L", "Maska kirurgjike", "Doreza nitrile M", "Doreza nitrile L", "Termometër digjital", "Matës tensioni", "Shiringa 5ml", "Shiringa 10ml", "Alkool 70%", "Pambuk 100g", "Serum fiziologjik", "Kapsula omega-3"],
    units: ["kuti", "copë", "paketë", "L"],
  },
  auto: {
    prefix: "AUT",
    categories: ["Filtra", "Frena", "Vajra", "Elektrikë", "Gomë"],
    names: ["Filtër vaji", "Filtër ajri", "Filtër kabine", "Filtër karburanti", "Disk frenash para", "Disk frenash prapa", "Pllaka frenash", "Vaj motori 5W30 5L", "Vaj motori 10W40 4L", "Vaj transmisioni", "Antifriz 5L", "Bateri 60Ah", "Bateri 74Ah", "Llambë H4", "Llambë H7", "Fshirëse xhami 55cm", "Kandelë ndezjeje", "Rrip alternatori", "Gomë 205/55 R16", "Gomë 195/65 R15", "Amortizator para", "Amortizator prapa", "Lëng frenash DOT4", "Ujë xhamash 5L"],
    units: ["copë", "L", "set", "paketë"],
  },
  textile: {
    prefix: "TKS",
    categories: ["Pambuk", "Poliestër", "Fije", "Aksesorë", "Produkt i gatshëm"],
    names: ["Pëlhurë pambuku e bardhë", "Pëlhurë pambuku e zezë", "Pëlhurë pambuku blu", "Poliestër 150g", "Poliestër 200g", "Fije pambuku 40/2", "Fije poliestër 120", "Zinxhir 20cm", "Zinxhir 60cm", "Kopsa 15mm", "Kopsa 20mm", "Etiketë e thurur", "Etiketë karton", "Bluzë S", "Bluzë M", "Bluzë L", "Bluzë XL", "Pantallona 30", "Pantallona 32", "Pantallona 34", "Xhaketë M", "Xhaketë L", "Qese paketimi", "Kuti transporti"],
    units: ["m", "kg", "copë", "rrotull", "paketë"],
  },
};

// Deterministic pseudo-random so a re-run produces the same dataset.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function seedEmail(local: string) {
  return `${local}@${SEED_DOMAIN}`;
}

// ── Teardown ────────────────────────────────────────────────────────────

async function removePreviousRun() {
  const seedUsers = await db.select({ id: users.id }).from(users).where(like(users.email, `%@${SEED_DOMAIN}`));
  const userIds = seedUsers.map((u) => u.id);
  if (userIds.length === 0) return;

  const orgRows = await db
    .selectDistinct({ id: memberships.organizationId })
    .from(memberships)
    .where(inArray(memberships.userId, userIds));
  const orgIds = orgRows.map((o) => o.id);

  if (orgIds.length > 0) {
    const facilityRows = await db.select({ id: facilities.id }).from(facilities).where(inArray(facilities.organizationId, orgIds));
    const facilityIds = facilityRows.map((f) => f.id);
    await db.delete(movements).where(inArray(movements.organizationId, orgIds));
    if (facilityIds.length > 0) {
      const locationRows = await db.select({ id: locations.id }).from(locations).where(inArray(locations.facilityId, facilityIds));
      const locationIds = locationRows.map((l) => l.id);
      if (locationIds.length > 0) await db.delete(stock).where(inArray(stock.locationId, locationIds));
      await db.delete(locations).where(inArray(locations.facilityId, facilityIds));
      await db.delete(facilityLevels).where(inArray(facilityLevels.facilityId, facilityIds));
      await db.delete(facilities).where(inArray(facilities.id, facilityIds));
    }
    await db.delete(items).where(inArray(items.organizationId, orgIds));
    await db.delete(invites).where(inArray(invites.organizationId, orgIds));
    await db.delete(payments).where(inArray(payments.organizationId, orgIds));
    await db.delete(memberships).where(inArray(memberships.organizationId, orgIds));
    await db.delete(organizations).where(inArray(organizations.id, orgIds));
  }
  await db.delete(users).where(inArray(users.id, userIds));
  console.log(`Removed previous run: ${userIds.length} users, ${orgIds.length} organizations`);
}

// ── Layout ──────────────────────────────────────────────────────────────

// The same containment / code / bin-grid rules as createEntityAt() in
// src/app/builder/actions.ts, without the session and translation
// plumbing a script has no use for.
async function layoutFacility(facilityId: string, spec: SeedFacility) {
  await db.insert(facilityLevels).values([1, 2].map((index) => ({ facilityId, index })));

  const specs = buildTemplate(spec.template, spec.widthM, spec.heightM);
  const placed: (typeof locations.$inferSelect)[] = [];
  const binIds: string[] = [];

  for (const s of specs) {
    const type = LOCATION_TYPES[s.kind];
    const zones = placed.filter((l) => l.kind === "zone");
    const containing = s.kind === "zone" ? null : findContainingZone(zones, s);
    const code = nextCode(s.kind, containing?.code ?? null, placed.map((l) => l.code).filter((c): c is string => !!c));
    const isLeaf = type.spatial === "store" && s.bays <= 1 && s.levels <= 1;

    const [created] = await db
      .insert(locations)
      .values({
        facilityId,
        parentId: containing?.id ?? null,
        kind: s.kind,
        name: type.label.toUpperCase(),
        code,
        isBin: isLeaf,
        xM: s.xM,
        yM: s.yM,
        widthM: s.widthM,
        heightM: s.heightM,
        bays: type.spatial === "store" ? s.bays : 1,
        levels: type.spatial === "store" ? s.levels : 1,
      })
      .returning();
    placed.push(created);
    if (isLeaf) binIds.push(created.id);

    if (type.spatial === "store" && !isLeaf) {
      const rows: (typeof locations.$inferInsert)[] = [];
      for (let level = 1; level <= s.levels; level++) {
        for (let bay = 1; bay <= s.bays; bay++) {
          rows.push({
            facilityId,
            parentId: created.id,
            kind: "bin" as LocationKind,
            name: "BIN",
            code: bayCode(code, level, bay, s.levels),
            isBin: true,
            bays: 1,
            levels: 1,
            bay,
            level,
          });
        }
      }
      const bins = await db.insert(locations).values(rows).returning({ id: locations.id });
      binIds.push(...bins.map((b) => b.id));
    }
  }
  return binIds;
}

// ── Stock & history ─────────────────────────────────────────────────────

async function fillFacility(
  organizationId: string,
  binIds: string[],
  itemIds: string[],
  memberIds: string[],
  fillPct: number,
  random: () => number,
) {
  const stockRows: (typeof stock.$inferInsert)[] = [];
  const movementRows: (typeof movements.$inferInsert)[] = [];
  const pick = <T,>(arr: T[]) => arr[Math.floor(random() * arr.length)];

  for (const locationId of binIds) {
    if (random() > fillPct) continue;
    const itemId = pick(itemIds);
    const received = 10 + Math.floor(random() * 90);
    const picked = random() < 0.6 ? Math.floor(random() * received * 0.5) : 0;
    const receivedAt = new Date(now - Math.floor(random() * 60) * DAY);
    movementRows.push({ organizationId, itemId, toLocationId: locationId, fromLocationId: null, quantity: received, reason: "receive", performedBy: pick(memberIds), createdAt: receivedAt });
    if (picked > 0) {
      const pickedAt = new Date(receivedAt.getTime() + Math.floor(random() * 20) * DAY);
      movementRows.push({ organizationId, itemId, fromLocationId: locationId, toLocationId: null, quantity: picked, reason: "pick", performedBy: pick(memberIds), createdAt: pickedAt > new Date() ? new Date() : pickedAt });
    }
    stockRows.push({ itemId, locationId, quantity: received - picked });
  }

  for (let i = 0; i < stockRows.length; i += 500) await db.insert(stock).values(stockRows.slice(i, i + 500));
  for (let i = 0; i < movementRows.length; i += 500) await db.insert(movements).values(movementRows.slice(i, i + 500));
  return { stocked: stockRows.length, movements: movementRows.length };
}

// ── Main ────────────────────────────────────────────────────────────────

// Refuses anything that isn't the local Docker Postgres — so a stray
// `pnpm db:seed:dev` with a production .env in the shell cannot put
// twelve Test1234! accounts on the real database. Neon, Render, any
// hosted URL: the hostname is never localhost.
const dbHost = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? "").hostname;
  } catch {
    return "";
  }
})();
if (!["localhost", "127.0.0.1", "::1", "postgres"].includes(dbHost)) {
  console.error(`seed-dev refuses to run against "${dbHost || "(unset)"}" — local databases only.`);
  process.exit(1);
}

const planRows = await db.select().from(plans);
const planByKey = Object.fromEntries(planRows.map((p) => [p.key, p]));
for (const key of ["starter", "business", "enterprise"]) {
  if (!planByKey[key]) throw new Error(`Plan "${key}" missing — run \`pnpm db:seed\` first`);
}

await removePreviousRun();

const passwordHash = await hash(PASSWORD, 10);
const userIdByEmail = new Map<string, string>();
const random = rng(20260920);

async function ensureUser(u: SeedUser) {
  const email = seedEmail(u.email);
  const existing = userIdByEmail.get(email);
  if (existing) return existing;
  const [row] = await db
    .insert(users)
    .values({ email, normalizedEmail: normalizeEmail(email), passwordHash, name: u.name, emailVerifiedAt: new Date() })
    .returning({ id: users.id });
  userIdByEmail.set(email, row.id);
  return row.id;
}

for (const spec of ORGS) {
  const plan = planByKey[spec.plan];
  const [org] = await db
    .insert(organizations)
    .values({
      name: spec.name,
      planId: plan.id,
      subscriptionStatus: spec.status,
      trialEndsAt: spec.trialEndsAt ?? null,
      paidUntil: spec.paidUntil ?? null,
    })
    .returning();

  const memberIds: string[] = [];
  for (const u of spec.users) {
    const userId = await ensureUser(u);
    await db.insert(memberships).values({ userId, organizationId: org.id, role: u.role });
    memberIds.push(userId);
  }

  // A paid org gets the payment row that would have moved paid_until.
  if (spec.status === "active" && spec.paidUntil) {
    await db.insert(payments).values({
      organizationId: org.id,
      planId: plan.id,
      months: 6,
      amountCents: plan.priceCents * 6,
      currency: "EUR",
      status: "paid",
      provider: "manual",
      note: "seed-dev: bank transfer",
      periodStart: new Date(spec.paidUntil.getTime() - 180 * DAY),
      periodEnd: spec.paidUntil,
      paidAt: new Date(spec.paidUntil.getTime() - 180 * DAY),
    });
  }

  const cat = CATALOGUES[spec.catalogue];
  const itemRows: (typeof items.$inferInsert)[] = [];
  for (let i = 0; i < spec.itemCount; i++) {
    const base = cat.names[i % cat.names.length];
    const variant = Math.floor(i / cat.names.length);
    itemRows.push({
      organizationId: org.id,
      name: variant === 0 ? base : `${base} (v${variant + 1})`,
      sku: `${cat.prefix}-${String(i + 1).padStart(4, "0")}`,
      category: cat.categories[i % cat.categories.length],
      unitOfMeasure: cat.units[i % cat.units.length],
    });
  }
  const itemIds = (await db.insert(items).values(itemRows).returning({ id: items.id })).map((r) => r.id);

  let totalBins = 0;
  let totalStocked = 0;
  let totalMovements = 0;
  for (const f of spec.facilities) {
    const [facility] = await db
      .insert(facilities)
      .values({ organizationId: org.id, name: f.name, widthM: f.widthM, heightM: f.heightM })
      .returning();
    const binIds = await layoutFacility(facility.id, f);
    const filled = await fillFacility(org.id, binIds, itemIds, memberIds, f.fillPct, random);
    totalBins += binIds.length;
    totalStocked += filled.stocked;
    totalMovements += filled.movements;
  }

  console.log(
    `${spec.name.padEnd(20)} ${spec.plan.padEnd(10)} ${spec.status.padEnd(9)} users=${spec.users.length} facilities=${spec.facilities.length} items=${spec.itemCount} bins=${totalBins} stocked=${totalStocked} movements=${totalMovements}`,
  );
}

console.log(`\nAll accounts use the password: ${PASSWORD}`);
for (const spec of ORGS) {
  for (const u of spec.users) console.log(`  ${seedEmail(u.email).padEnd(36)} ${u.role.padEnd(8)} ${spec.name}`);
}
process.exit(0);
