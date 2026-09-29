import { freshDatabase } from "@/test-support/setup";
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { eq } from "drizzle-orm";
import { disableUser, forceSignOut, listUsersForAdmin, reactivateUser } from "@/app/internal/user-actions";
import { listAuditLog } from "@/app/internal/actions";
import { db } from "@/db";
import { users } from "@/db/schema";
import { addMember, createOrg, createUser } from "@/test-support/factories";
import { actAs } from "@/test-support/stubs/auth";

// Epic A2: cross-tenant user search/detail, force sign-out (reuses the
// existing signOutEverywhere), and a platform-wide account disable that's
// independent of any single organization.
describe("internal: user management", () => {
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

  test("listUsersForAdmin carries memberships and never exposes passwordHash", async () => {
    const { org } = await createOrg();
    const worker = await addMember(org.id, "worker");

    const list = await listUsersForAdmin();
    const row = list.find((u) => u.id === worker.id);
    assert.ok(row);
    assert.equal("passwordHash" in row, false, "the admin dashboard must never receive password hashes");
    assert.deepEqual(row.memberships, [{ organizationId: org.id, orgName: org.name, role: "worker" }]);
  });

  test("forceSignOut bumps the session version and logs it", async () => {
    const target = await createUser();
    const before = (await db.select({ sv: users.sessionVersion }).from(users).where(eq(users.id, target.id)))[0].sv;

    const result = await forceSignOut(target.id);
    assert.ok(result.ok);

    const after = (await db.select({ sv: users.sessionVersion }).from(users).where(eq(users.id, target.id)))[0].sv;
    assert.equal(after, before + 1);

    const entries = await listAuditLog();
    const logged = entries.find((e) => e.targetId === target.id && e.action === "user.forceSignOut");
    assert.ok(logged);
  });

  test("disableUser requires a reason, blocks nothing without one, sets the block, bumps the session version, and logs it", async () => {
    const target = await createUser();
    const svBefore = (await db.select({ sv: users.sessionVersion }).from(users).where(eq(users.id, target.id)))[0].sv;

    const blank = await disableUser(target.id, "   ");
    assert.equal(blank.ok, false);
    const untouched = (await db.select().from(users).where(eq(users.id, target.id)))[0];
    assert.equal(untouched.disabledAt, null);
    assert.equal(untouched.sessionVersion, svBefore);

    const ok = await disableUser(target.id, "spam signups");
    assert.ok(ok.ok);
    const disabled = (await db.select().from(users).where(eq(users.id, target.id)))[0];
    assert.ok(disabled.disabledAt);
    assert.equal(disabled.disabledReason, "spam signups");
    assert.equal(disabled.sessionVersion, svBefore + 1, "an existing session must end immediately, not just future logins");

    const entries = await listAuditLog();
    const logged = entries.find((e) => e.targetId === target.id && e.action === "user.disable");
    assert.deepEqual(logged?.metadata, { reason: "spam signups" });
  });

  test("reactivateUser clears the block and logs it", async () => {
    const target = await createUser();
    await disableUser(target.id, "test");

    const result = await reactivateUser(target.id);
    assert.ok(result.ok);
    const row = (await db.select().from(users).where(eq(users.id, target.id)))[0];
    assert.equal(row.disabledAt, null);
    assert.equal(row.disabledReason, null);

    const entries = await listAuditLog();
    const logged = entries.find((e) => e.targetId === target.id && e.action === "user.reactivate");
    assert.ok(logged);
  });

  test("disableUser refuses a non-admin", async () => {
    const target = await createUser();
    const outsider = await createUser({ email: "not-admin@example.com", normalizedEmail: "not-admin@example.com" });
    actAs(outsider);
    const result = await disableUser(target.id, "should not apply");
    assert.equal(result.ok, false);
    const row = (await db.select().from(users).where(eq(users.id, target.id)))[0];
    assert.equal(row.disabledAt, null);
    actAs(admin);
  });
});
