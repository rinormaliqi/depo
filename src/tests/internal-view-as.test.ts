import { freshDatabase } from "@/test-support/setup";
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { eq } from "drizzle-orm";
import { getBlueprint } from "@/app/builder/actions";
import { listAuditLog } from "@/app/internal/actions";
import { db } from "@/db";
import { adminViewAsSessions } from "@/db/schema";
import { endViewAs, getActiveViewAs, startViewAs } from "@/lib/view-as";
import { addMember, createOrg, createUser } from "@/test-support/factories";
import { actAs } from "@/test-support/stubs/auth";
import { resetCookies } from "@/test-support/stubs/next-headers";

// Epic A3: a time-boxed, read-only "view as this organization" grant. The
// session lives in its own table, never in memberships, so nothing that
// checks real permissions can mistake it for one.
describe("admin view-as", () => {
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

  test("startViewAs opens a session that getActiveViewAs resolves, and logs it", async () => {
    resetCookies();
    actAs(admin);
    const { org } = await createOrg();

    assert.equal(await getActiveViewAs(), null, "nothing active yet");
    await startViewAs(org.id);

    const active = await getActiveViewAs();
    assert.ok(active);
    assert.equal(active.organizationId, org.id);
    assert.equal(active.organizationName, org.name);

    const entries = await listAuditLog();
    assert.ok(entries.find((e) => e.action === "org.viewAs.start" && e.targetId === org.id));
  });

  test("endViewAs closes the session and logs it", async () => {
    resetCookies();
    actAs(admin);
    const { org } = await createOrg();
    await startViewAs(org.id);
    assert.ok(await getActiveViewAs());

    await endViewAs();
    assert.equal(await getActiveViewAs(), null);

    const entries = await listAuditLog();
    assert.ok(entries.find((e) => e.action === "org.viewAs.end" && e.targetId === org.id));
  });

  test("an expired session no longer resolves", async () => {
    resetCookies();
    actAs(admin);
    const { org } = await createOrg();
    await startViewAs(org.id);
    const active = await getActiveViewAs();
    assert.ok(active);

    await db.update(adminViewAsSessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(adminViewAsSessions.id, active.sessionId));
    assert.equal(await getActiveViewAs(), null);
  });

  test("revoking platform-admin status stops the session resolving before it expires", async () => {
    resetCookies();
    actAs(admin);
    const { org } = await createOrg();
    await startViewAs(org.id);
    assert.ok(await getActiveViewAs());

    process.env.PLATFORM_ADMIN_EMAILS = "";
    assert.equal(await getActiveViewAs(), null, "no longer a platform admin, even with an unexpired row");
    process.env.PLATFORM_ADMIN_EMAILS = admin.email;
  });

  test("startViewAs refuses a non-admin", async () => {
    resetCookies();
    const outsider = await createUser({ email: "not-admin@example.com", normalizedEmail: "not-admin@example.com" });
    actAs(outsider);
    const { org } = await createOrg();
    await assert.rejects(() => startViewAs(org.id), /Not authorized/);
    assert.equal(await getActiveViewAs(), null);
  });

  test("view-as grants no write access: the real action path only ever consults the caller's own membership", async () => {
    resetCookies();
    actAs(admin); // the founder has no membership anywhere
    const { org, facility } = await createOrg();
    await startViewAs(org.id);
    assert.ok(await getActiveViewAs(), "view-as is active for this org");

    // getBlueprint() is the exact function the real /builder page and
    // BlueprintCanvas's own reload() call — it goes through
    // requireOwnedFacility() -> requireOrgId(), which is about the
    // caller's REAL session and never consults the view-as cookie.
    await assert.rejects(() => getBlueprint(facility.id), /Not authenticated/);
  });

  test("view-as does not leak across organizations the admin actually belongs to", async () => {
    resetCookies();
    const { org: adminOrg, facility: adminFacility } = await createOrg();
    await addMember(adminOrg.id, "admin", admin);
    actAs(admin);

    const { org: otherOrg } = await createOrg();
    await startViewAs(otherOrg.id);

    // The admin's own real membership still resolves their own facility —
    // view-as changes nothing about their real session.
    const blueprint = await getBlueprint(adminFacility.id);
    assert.ok(blueprint);
  });
});
