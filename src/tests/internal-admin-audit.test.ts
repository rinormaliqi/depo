import { freshDatabase } from "@/test-support/setup";
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { desc, eq } from "drizzle-orm";
import { listAuditLog, recordManualPayment, updateOrgBilling } from "@/app/internal/actions";
import { db } from "@/db";
import { adminAuditLog } from "@/db/schema";
import { recordAdminAction } from "@/lib/admin-audit";
import { createOrg, createUser, seedPlans } from "@/test-support/factories";
import { actAs } from "@/test-support/stubs/auth";

// Epic A0: every sensitive /internal action must leave a durable trail —
// who (from the session, never trusted input), what, on which org/user.
describe("admin audit log", () => {
  let admin: Awaited<ReturnType<typeof createUser>>;
  let previousAllowlist: string | undefined;

  before(async () => {
    await freshDatabase();
    admin = await createUser({ email: "founder@smartdepo.test", normalizedEmail: "founder@smartdepo.test" });
    previousAllowlist = process.env.PLATFORM_ADMIN_EMAILS;
    process.env.PLATFORM_ADMIN_EMAILS = admin.email;
  });

  after(() => {
    process.env.PLATFORM_ADMIN_EMAILS = previousAllowlist;
  });

  test("recordAdminAction writes the actor from the session, not from input", async () => {
    actAs(admin);
    await recordAdminAction({ action: "test.action", targetType: "organization", targetId: "00000000-0000-0000-0000-000000000001", metadata: { note: "x" } });

    const [row] = await db.select().from(adminAuditLog).orderBy(desc(adminAuditLog.createdAt)).limit(1);
    assert.equal(row.actorEmail, admin.email);
    assert.equal(row.action, "test.action");
    assert.equal(row.targetType, "organization");
    assert.deepEqual(row.metadata, { note: "x" });
  });

  test("recordAdminAction refuses without an authenticated session", async () => {
    actAs(null);
    await assert.rejects(
      () => recordAdminAction({ action: "test.action", targetType: "organization", targetId: "00000000-0000-0000-0000-000000000001" }),
      /no authenticated session/,
    );
  });

  test("updateOrgBilling logs before/after, and only when something actually changes", async () => {
    actAs(admin);
    const { org } = await createOrg({ status: "trialing" });
    const plans = await seedPlans();

    const changed = await updateOrgBilling(org.id, { planId: plans.business.id, subscriptionStatus: "active" });
    assert.ok(changed.ok);

    const [logged] = await db.select().from(adminAuditLog).where(eq(adminAuditLog.targetId, org.id));
    assert.equal(logged.action, "org.billing.update");
    const metadata = logged.metadata as { before: { subscriptionStatus: string }; after: { subscriptionStatus: string } };
    assert.equal(metadata.before.subscriptionStatus, "trialing");
    assert.equal(metadata.after.subscriptionStatus, "active");

    // An empty patch touches nothing, so it must not add a row.
    const noop = await updateOrgBilling(org.id, {});
    assert.ok(noop.ok);
    const rows = await db.select().from(adminAuditLog).where(eq(adminAuditLog.targetId, org.id));
    assert.equal(rows.length, 1, "no new row for a patch that changed nothing");
  });

  test("recordManualPayment logs the plan, months and amount", async () => {
    actAs(admin);
    const { org } = await createOrg({ status: "trialing" });
    const plans = await seedPlans();

    const result = await recordManualPayment(org.id, { planId: plans.starter.id, months: 3, note: "bank transfer" });
    assert.ok(result.ok);

    const [logged] = await db.select().from(adminAuditLog).where(eq(adminAuditLog.targetId, org.id));
    assert.equal(logged.action, "org.payment.manual");
    const metadata = logged.metadata as { planKey: string; months: number; note: string };
    assert.equal(metadata.planKey, "starter");
    assert.equal(metadata.months, 3);
    assert.equal(metadata.note, "bank transfer");
  });

  test("listAuditLog returns newest first and refuses a non-admin", async () => {
    actAs(admin);
    const { org: orgA } = await createOrg();
    const { org: orgB } = await createOrg();
    await updateOrgBilling(orgA.id, { subscriptionStatus: "active" });
    await updateOrgBilling(orgB.id, { subscriptionStatus: "active" });

    const entries = await listAuditLog();
    const first = entries.findIndex((e) => e.targetId === orgB.id);
    const second = entries.findIndex((e) => e.targetId === orgA.id);
    assert.ok(first !== -1 && second !== -1 && first < second, "the most recently logged org comes first");

    const outsider = await createUser({ email: "not-admin@example.com", normalizedEmail: "not-admin@example.com" });
    actAs(outsider);
    await assert.rejects(() => listAuditLog(), /Not authorized/);
  });
});
