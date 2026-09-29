import { freshDatabase } from "@/test-support/setup";
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { eq } from "drizzle-orm";
import { getOrgDetail, listAuditLog, listOrganizations, reactivateOrganization, suspendOrganization } from "@/app/internal/actions";
import { db } from "@/db";
import { adminAuditLog } from "@/db/schema";
import { getOrgLockReason } from "@/lib/session";
import { addMember, createBin, createItem, createOrg, createUser } from "@/test-support/factories";
import { actAs } from "@/test-support/stubs/auth";
import { receiveStockAt } from "@/lib/stock";

// Epic A1: search needs member emails alongside the org, the detail view
// needs members/facilities/items/last-activity, and suspension is a
// platform-admin lock independent of billing that only an admin can lift.
describe("internal: organization search, detail, suspend", () => {
  let admin: Awaited<ReturnType<typeof createUser>>;
  let previousAllowlist: string | undefined;

  before(async () => {
    await freshDatabase();
    admin = await createUser({ email: "founder@smartdepo.test", normalizedEmail: "founder@smartdepo.test" });
    previousAllowlist = process.env.PLATFORM_ADMIN_EMAILS;
    process.env.PLATFORM_ADMIN_EMAILS = admin.email;
    actAs(admin);
  });

  after(() => {
    process.env.PLATFORM_ADMIN_EMAILS = previousAllowlist;
  });

  test("listOrganizations carries each member's email for search", async () => {
    const { org } = await createOrg();
    const member = await addMember(org.id, "manager");

    const { organizations } = await listOrganizations();
    const row = organizations.find((o) => o.id === org.id);
    assert.ok(row);
    assert.deepEqual(row.memberEmails.sort(), [member.email].sort());
  });

  test("getOrgDetail reports members, facility/item counts, and last activity", async () => {
    const { org, facility } = await createOrg();
    const worker = await addMember(org.id, "worker");
    const bin = await createBin(facility.id, "A-01-1");
    const item = await createItem(org.id, "Cable");
    await receiveStockAt(org.id, worker.id, bin.id, item.id, 5);

    const result = await getOrgDetail(org.id);
    assert.ok(result.ok);
    assert.equal(result.value.members.length, 1);
    assert.equal(result.value.members[0].email, worker.email);
    assert.equal(result.value.facilities.length, 1);
    assert.equal(result.value.itemCount, 1);
    assert.ok(result.value.lastActivityAt, "a movement just happened");
  });

  test("getOrgDetail refuses a non-admin", async () => {
    const { org } = await createOrg();
    const outsider = await createUser({ email: "not-admin@example.com", normalizedEmail: "not-admin@example.com" });
    actAs(outsider);
    const result = await getOrgDetail(org.id);
    assert.equal(result.ok, false);
    actAs(admin);
  });

  test("suspendOrganization requires a reason, locks the org regardless of billing, and logs it", async () => {
    const { org } = await createOrg({ status: "active", paidUntil: null });
    assert.equal(await getOrgLockReason(org.id), null);

    const blank = await suspendOrganization(org.id, "  ");
    assert.equal(blank.ok, false);
    assert.equal(await getOrgLockReason(org.id), null, "a refused suspension changes nothing");

    const ok = await suspendOrganization(org.id, "unpaid invoice dispute");
    assert.ok(ok.ok);
    assert.equal(await getOrgLockReason(org.id), "suspended");

    const [logged] = await db.select().from(adminAuditLog).where(eq(adminAuditLog.targetId, org.id));
    assert.equal(logged.action, "org.suspend");
    assert.deepEqual(logged.metadata, { reason: "unpaid invoice dispute" });
  });

  test("reactivateOrganization clears the suspension and logs it", async () => {
    const { org } = await createOrg();
    await suspendOrganization(org.id, "test");
    assert.equal(await getOrgLockReason(org.id), "suspended");

    const result = await reactivateOrganization(org.id);
    assert.ok(result.ok);
    assert.equal(await getOrgLockReason(org.id), null);

    const entries = await listAuditLog();
    const reactivated = entries.find((e) => e.targetId === org.id && e.action === "org.reactivate");
    assert.ok(reactivated);
  });
});
