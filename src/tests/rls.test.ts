import { freshDatabase } from "@/test-support/setup";
import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { eq, sql } from "drizzle-orm";
import { db, type Tx } from "@/db";
import {
  contracts, facilities, facilityLevels, facilityUnderlays, inventorySettings, invites, itemCustomFieldDefinitions,
  itemCustomFieldValues, items, locations, memberships, movements, payments, stock,
} from "@/db/schema";
import { addMember, createBin, createItem, createOrg, seedPlans } from "@/test-support/factories";

// #228 phase 1: the policies in drizzle/0026_rls_policies.sql, exercised
// the way the app will use them — a transaction that switches to app_user
// and names its company. The tests connect as a superuser, which bypasses
// RLS outright, so everything outside asTenant() sees every row.
async function asTenant<T>(ctx: { orgId?: string; userId?: string }, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local role app_user`);
    if (ctx.orgId) await tx.execute(sql`select set_config('app.org_id', ${ctx.orgId}, true)`);
    if (ctx.userId) await tx.execute(sql`select set_config('app.user_id', ${ctx.userId}, true)`);
    return fn(tx);
  });
}

const TABLES = {
  facilities, items, movements, itemCustomFieldDefinitions, inventorySettings, invites, payments, contracts, memberships,
  locations, facilityLevels, facilityUnderlays, itemCustomFieldValues, stock,
};

async function countAll(tx: Tx) {
  const out: Record<string, number> = {};
  for (const [name, table] of Object.entries(TABLES)) {
    const [row] = await tx.select({ n: sql<number>`count(*)::int` }).from(table);
    out[name] = row.n;
  }
  return out;
}

const ONE_EACH = Object.fromEntries(Object.keys(TABLES).map((k) => [k, 1]));
const NONE = Object.fromEntries(Object.keys(TABLES).map((k) => [k, 0]));

// One row in every tenant table, so "sees exactly its own" is a count of 1.
async function company() {
  const { org, facility, plan } = await createOrg();
  const admin = await addMember(org.id, "admin");
  const bin = await createBin(facility.id, "A-01");
  const item = await createItem(org.id);
  await db.insert(stock).values({ itemId: item.id, locationId: bin.id, quantity: 5 });
  await db.insert(movements).values({ organizationId: org.id, itemId: item.id, toLocationId: bin.id, quantity: 5, reason: "receive", performedBy: admin.id });
  const [field] = await db.insert(itemCustomFieldDefinitions).values({ organizationId: org.id, key: "color", label: "Color", type: "text" }).returning();
  await db.insert(itemCustomFieldValues).values({ itemId: item.id, fieldDefinitionId: field.id, value: "red" });
  await db.insert(inventorySettings).values({ organizationId: org.id });
  await db.insert(invites).values({ organizationId: org.id, email: `x-${org.id}@example.test`, role: "worker", token: `t-${org.id}`, invitedBy: admin.id, expiresAt: new Date(Date.now() + 86400_000) });
  await db.insert(payments).values({ organizationId: org.id, planId: plan.id, months: 1, amountCents: 11900, currency: "EUR", provider: "manual" });
  await db.insert(contracts).values({ organizationId: org.id, planId: plan.id, months: 12, pricingSnapshot: {} as never, clientInfo: {} as never, createdBy: admin.id });
  await db.insert(facilityLevels).values({ facilityId: facility.id, index: 1 });
  await db.insert(facilityUnderlays).values({ facilityId: facility.id, mimeType: "image/png", data: Buffer.from([0x89, 0x50]), widthPx: 100, heightPx: 100, scale: 0.1 });
  return { org, facility, admin, bin, item, field };
}

describe("row-level security (#228)", () => {
  let a: Awaited<ReturnType<typeof company>>;
  let b: Awaited<ReturnType<typeof company>>;

  before(async () => {
    await freshDatabase();
    await seedPlans();
    a = await company();
    b = await company();
  });

  test("the owner connection still sees everything — phase 1 changes nothing for the app", async () => {
    const all = await db.transaction((tx) => countAll(tx));
    assert.deepEqual(all, Object.fromEntries(Object.keys(TABLES).map((k) => [k, 2])));
  });

  test("each company sees exactly its own row in every table", async () => {
    assert.deepEqual(await asTenant({ orgId: a.org.id }, countAll), ONE_EACH);
    assert.deepEqual(await asTenant({ orgId: b.org.id }, countAll), ONE_EACH);
    const seen = await asTenant({ orgId: a.org.id }, (tx) => tx.select({ id: items.id }).from(items));
    assert.deepEqual(seen.map((r) => r.id), [a.item.id]);
  });

  test("with no company set, nothing is visible", async () => {
    assert.deepEqual(await asTenant({}, countAll), NONE);
  });

  test("a person sees their own memberships in other companies, and only those", async () => {
    await addMember(b.org.id, "worker", a.admin);
    const rows = await asTenant({ orgId: a.org.id, userId: a.admin.id }, (tx) => tx.select().from(memberships));
    // A's own membership plus the one in B — not B's admin.
    assert.deepEqual(rows.map((m) => m.organizationId).sort(), [a.org.id, b.org.id].sort());
    assert.ok(rows.every((m) => m.organizationId === a.org.id || m.userId === a.admin.id));
  });

  test("another company's rows can't be changed or deleted", async () => {
    await asTenant({ orgId: a.org.id }, async (tx) => {
      const renamed = await tx.update(items).set({ name: "hijacked" }).where(eq(items.id, b.item.id)).returning();
      assert.equal(renamed.length, 0);
      const removed = await tx.delete(locations).where(eq(locations.id, b.bin.id)).returning();
      assert.equal(removed.length, 0);
    });
    const [still] = await db.select().from(items).where(eq(items.id, b.item.id));
    assert.equal(still.name, "Item");
  });

  test("a row can't be written into another company, directly or through its parent", async () => {
    const refused = async (label: string, fn: (tx: Tx) => Promise<unknown>) =>
      // Drizzle wraps the Postgres error; the policy's message is on its cause.
      assert.rejects(asTenant({ orgId: a.org.id }, fn), (e: Error) => /row-level security/.test(String((e.cause as Error | undefined)?.message)), label);

    await refused("item for B", (tx) => tx.insert(items).values({ organizationId: b.org.id, name: "x", unitOfMeasure: "pcs" }));
    await refused("bin in B's facility", (tx) => tx.insert(locations).values({ facilityId: b.facility.id, name: "x", code: "X", kind: "bin", isBin: true }));
    await refused("A's item into B's bin", (tx) => tx.insert(stock).values({ itemId: a.item.id, locationId: b.bin.id, quantity: 1 }));
    await refused("moving A's item to B", (tx) => tx.update(items).set({ organizationId: b.org.id }).where(eq(items.id, a.item.id)));
    await refused("joining B", (tx) => tx.insert(memberships).values({ userId: a.admin.id, organizationId: b.org.id, role: "admin" }));
  });

  test("writes inside the company go through", async () => {
    await asTenant({ orgId: a.org.id }, async (tx) => {
      const [bin] = await tx.insert(locations).values({ facilityId: a.facility.id, name: "A-02", code: "A-02", kind: "bin", isBin: true }).returning();
      await tx.insert(stock).values({ itemId: a.item.id, locationId: bin.id, quantity: 2 });
      await tx.update(items).set({ name: "Renamed" }).where(eq(items.id, a.item.id));
    });
    const [item] = await db.select().from(items).where(eq(items.id, a.item.id));
    assert.equal(item.name, "Renamed");
  });

  test("the role and setting don't outlive the transaction", async () => {
    await asTenant({ orgId: a.org.id }, async () => {});
    const [row] = await db.execute<{ role: string; org: string | null }>(sql`select current_user as role, app_current_org_id()::text as org`);
    assert.notEqual(row.role, "app_user");
    assert.equal(row.org, null);
  });
});
