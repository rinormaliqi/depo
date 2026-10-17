import { freshDatabase } from "@/test-support/setup";
import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { ownerDb } from "@/test-support/owner-db";
import { items } from "@/db/schema";
import { getMySession } from "@/lib/session";
import { asOwner, inOrg, outsideOrg, withOrg } from "@/lib/tenant";
import { UserError } from "@/lib/user-error";
import { addMember, createItem, createOrg, seedPlans } from "@/test-support/factories";
import { actAs } from "@/test-support/stubs/auth";

const whoAmI = async () => {
  const [row] = await db.execute<{ role: string; org: string | null }>(sql`select current_user as role, app_current_org_id()::text as org`);
  return row;
};

// #228 phase 2: what withOrg()/inOrg() promise the code running inside them.
describe("withOrg", () => {
  let a: Awaited<ReturnType<typeof createOrg>>;
  let b: Awaited<ReturnType<typeof createOrg>>;
  let aAdmin: Awaited<ReturnType<typeof addMember>>;

  before(async () => {
    await freshDatabase();
    await seedPlans();
    a = await createOrg();
    b = await createOrg();
    aAdmin = await addMember(a.org.id, "admin");
    await addMember(b.org.id, "admin");
    await createItem(a.org.id, "A's item");
    await createItem(b.org.id, "B's item");
  });

  test("db inside runs as app_user for the signed-in person's company, and is the pool again after", async () => {
    actAs(aAdmin);
    const inside = await inOrg(whoAmI);
    assert.deepEqual(inside, { role: "app_user", org: a.org.id });
    assert.notEqual((await whoAmI()).role, "app_user");
  });

  test("a query with no organization filter still only sees the company's own rows", async () => {
    actAs(aAdmin);
    const names = await inOrg(async () => (await db.select({ name: items.name }).from(items)).map((r) => r.name));
    assert.deepEqual(names, ["A's item"]);
  });

  test("the session inside is the one the transaction was opened for", async () => {
    actAs(aAdmin);
    const session = await inOrg(() => getMySession());
    assert.equal(session?.organizationId, a.org.id);
    assert.equal(session?.userId, aAdmin.id);
  });

  test("a failure rolls back what was written before it", async () => {
    actAs(aAdmin);
    await assert.rejects(
      inOrg(async () => {
        await db.insert(items).values({ organizationId: a.org.id, name: "half-done", unitOfMeasure: "pcs" });
        throw new UserError("nope");
      }),
      /nope/,
    );
    assert.equal((await ownerDb.select().from(items).where(eq(items.name, "half-done"))).length, 0);
  });

  test("a redirect commits first, then still reaches Next", async () => {
    actAs(aAdmin);
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/items;307;" });
    await assert.rejects(
      inOrg(async () => {
        await db.insert(items).values({ organizationId: a.org.id, name: "kept", unitOfMeasure: "pcs" });
        throw redirect;
      }),
      (e) => e === redirect,
    );
    assert.equal((await ownerDb.select().from(items).where(eq(items.name, "kept"))).length, 1);
  });

  test("nesting reuses the open transaction; another company's is refused", async () => {
    actAs(aAdmin);
    const session = { organizationId: a.org.id, userId: aAdmin.id, role: "admin" as const };
    const ids = await withOrg(session, async () => {
      const [outer] = await db.execute<{ id: string }>(sql`select txid_current()::text as id`);
      const [inner] = await withOrg(session, () => db.execute<{ id: string }>(sql`select txid_current()::text as id`));
      return [outer.id, inner.id];
    });
    assert.equal(ids[0], ids[1]);
    await assert.rejects(withOrg(session, () => withOrg({ ...session, organizationId: b.org.id }, async () => null)), /another organization/);
  });

  test("work still running after the transaction ended falls back to the pool", async () => {
    actAs(aAdmin);
    let later: Promise<{ role: string; org: string | null }> | null = null;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    await inOrg(async () => {
      later = gate.then(whoAmI);
    });
    release();
    const row = await later!;
    assert.notEqual(row.role, "app_user");
  });

  // Phase 3: what the app connection (DATABASE_URL_APP) sees on its own.
  test("outside any company the app connection sees no company rows; asOwner sees them all", { skip: process.env.TEST_DB_APP_ROLE === "off" }, async () => {
    const [who] = await db.execute<{ role: string }>(sql`select current_user as role`);
    assert.equal(who.role, "smartdepo_app_test", "the tests run the app on the restricted login");
    assert.equal((await db.select().from(items)).length, 0);
    const all = await asOwner(() => db.select().from(items));
    assert.ok(all.some((i) => i.organizationId === a.org.id) && all.some((i) => i.organizationId === b.org.id));
    assert.equal((await outsideOrg(() => db.select().from(items))).length, all.length);
  });

  test("asOwner is refused inside a company transaction", async () => {
    actAs(aAdmin);
    await assert.rejects(inOrg(() => asOwner(async () => null)), /inside a company transaction/);
  });
});
