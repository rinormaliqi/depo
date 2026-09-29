import { freshDatabase } from "@/test-support/setup";
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import { eq } from "drizzle-orm";
import { getPlatformOverview } from "@/app/internal/overview-actions";
import { suspendOrganization } from "@/app/internal/actions";
import { db } from "@/db";
import { movements, organizations } from "@/db/schema";
import { receiveStockAt } from "@/lib/stock";
import { addMember, createBin, createItem, createOrg, createUser } from "@/test-support/factories";
import { actAs } from "@/test-support/stubs/auth";

const DAY = 86_400_000;

// Epic A4: a cross-tenant overview — status counts, signup trend, an MRR
// estimate, and which organizations are actually being used. Each test
// starts from a truly empty database (beforeEach, not once for the whole
// file) because these assertions are on absolute counts across the
// platform, not on one specific org's own data.
describe("platform overview", () => {
  let admin: Awaited<ReturnType<typeof createUser>>;
  let previousAllowlist: string | undefined;

  before(() => {
    previousAllowlist = process.env.PLATFORM_ADMIN_EMAILS;
  });

  beforeEach(async () => {
    await freshDatabase();
    admin = await createUser({ email: "founder@smartdepo.test", normalizedEmail: "founder@smartdepo.test" });
    process.env.PLATFORM_ADMIN_EMAILS = admin.email;
    actAs(admin);
  });

  after(() => {
    process.env.PLATFORM_ADMIN_EMAILS = previousAllowlist;
  });

  test("counts organizations by subscription status and suspension", async () => {
    await createOrg({ status: "trialing" });
    await createOrg({ status: "trialing" });
    await createOrg({ status: "active", paidUntil: null });
    await createOrg({ status: "past_due" });
    await createOrg({ status: "canceled" });

    const suspended = await createOrg({ status: "active", paidUntil: null });
    await suspendOrganization(suspended.org.id, "test");

    const data = await getPlatformOverview();
    assert.equal(data.totalOrganizations, 6);
    assert.equal(data.statusCounts.trialing, 2);
    assert.equal(data.statusCounts.active, 2);
    assert.equal(data.statusCounts.past_due, 1);
    assert.equal(data.statusCounts.canceled, 1);
    assert.equal(data.suspendedCount, 1);
  });

  test("counts new signups within 30 and 90 days, and not outside either window", async () => {
    const { org: recent } = await createOrg();
    const { org: mid } = await createOrg();
    const { org: old } = await createOrg();
    await db.update(organizations).set({ createdAt: new Date(Date.now() - 10 * DAY) }).where(eq(organizations.id, recent.id));
    await db.update(organizations).set({ createdAt: new Date(Date.now() - 60 * DAY) }).where(eq(organizations.id, mid.id));
    await db.update(organizations).set({ createdAt: new Date(Date.now() - 200 * DAY) }).where(eq(organizations.id, old.id));

    const data = await getPlatformOverview();
    assert.equal(data.newLast30Days, 1);
    assert.equal(data.newLast90Days, 2);
  });

  test("MRR estimate sums the current plan price of active, not-yet-expired organizations only", async () => {
    const active = await createOrg({ planKey: "business", status: "active", paidUntil: new Date(Date.now() + 10 * DAY) });
    await createOrg({ planKey: "enterprise", status: "active", paidUntil: new Date(Date.now() - DAY) }); // expired: excluded
    await createOrg({ planKey: "starter", status: "trialing" }); // not paying: excluded

    const data = await getPlatformOverview();
    assert.equal(data.mrrCents, active.plan.priceCents);
  });

  test("ranks organizations by movements within the activity window, oldest activity excluded", async () => {
    const { org: busy, facility: busyFacility } = await createOrg();
    const worker = await addMember(busy.id, "worker");
    const bin = await createBin(busyFacility.id, "A-01-1");
    const item = await createItem(busy.id, "Widget");
    await receiveStockAt(busy.id, worker.id, bin.id, item.id, 5);
    await receiveStockAt(busy.id, worker.id, bin.id, item.id, 3);

    const { org: quiet, facility: quietFacility } = await createOrg();
    const quietWorker = await addMember(quiet.id, "worker");
    const quietBin = await createBin(quietFacility.id, "B-01-1");
    const quietItem = await createItem(quiet.id, "Gadget");
    await receiveStockAt(quiet.id, quietWorker.id, quietBin.id, quietItem.id, 1);
    // Push this one outside the 30-day window — it must not count.
    await db.update(movements).set({ createdAt: new Date(Date.now() - 40 * DAY) }).where(eq(movements.organizationId, quiet.id));

    const data = await getPlatformOverview();
    const busyEntry = data.mostActive.find((o) => o.organizationId === busy.id);
    assert.ok(busyEntry);
    assert.equal(busyEntry.movementCount, 2);
    assert.equal(data.mostActive.some((o) => o.organizationId === quiet.id), false, "activity outside the window doesn't count");
  });

  test("refuses a non-admin", async () => {
    const outsider = await createUser({ email: "not-admin@example.com", normalizedEmail: "not-admin@example.com" });
    actAs(outsider);
    await assert.rejects(() => getPlatformOverview(), /Not authorized/);
  });
});
