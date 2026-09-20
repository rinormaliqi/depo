import { freshDatabase } from "@/test-support/setup";
import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { requestNewInvite } from "@/app/invite/[token]/actions";
import { leaveOrganization, transferOwnership } from "@/app/team/actions";
import { db } from "@/db";
import { invites, memberships } from "@/db/schema";
import { unwrap } from "@/lib/action-result";
import { countRecent, LIMITS } from "@/lib/rate-limit";
import { getMySession } from "@/lib/session";
import { addMember, createOrg, seedPlans } from "@/test-support/factories";
import { actAs } from "@/test-support/stubs/auth";
import { resetCookies } from "@/test-support/stubs/next-headers";

const leave = unwrap(leaveOrganization);
const transfer = unwrap(transferOwnership);

describe("invite lifecycle: leaving and handing over", () => {
  before(async () => {
    await freshDatabase();
    await seedPlans();
    resetCookies();
  });

  test("a member can leave; the only admin cannot until ownership is handed over", async () => {
    const { org } = await createOrg();
    const admin = await addMember(org.id, "admin");
    const worker = await addMember(org.id, "worker");

    actAs(worker);
    await leave();
    assert.equal((await db.select().from(memberships).where(eq(memberships.userId, worker.id))).length, 0);
    assert.equal(await getMySession(), null, "no organization left");

    actAs(admin);
    await assert.rejects(leave(), /lastAdmin/);

    const manager = await addMember(org.id, "manager");
    await assert.rejects(transfer((await db.select().from(memberships).where(and(eq(memberships.userId, admin.id), eq(memberships.organizationId, org.id))))[0].id), /transferToSelf/);
    const [mm] = await db.select().from(memberships).where(and(eq(memberships.userId, manager.id), eq(memberships.organizationId, org.id)));
    await transfer(mm.id);
    const roles = Object.fromEntries((await db.select().from(memberships).where(eq(memberships.organizationId, org.id))).map((m) => [m.userId, m.role]));
    assert.equal(roles[manager.id], "admin");
    assert.equal(roles[admin.id], "manager");
    // Now the former admin may leave.
    await leave();
    assert.equal((await db.select().from(memberships).where(eq(memberships.userId, admin.id))).length, 0);
    resetCookies();
  });

  test("a dead invite link can ask the inviter for a new one, once per hour", async () => {
    const { org } = await createOrg();
    const admin = await addMember(org.id, "admin");
    await db.insert(invites).values({ organizationId: org.id, email: "late@example.com", role: "worker", token: "dead-1", invitedBy: admin.id, expiresAt: new Date(Date.now() - 1000) });
    assert.deepEqual(await requestNewInvite("dead-1"), { ok: true });
    assert.deepEqual(await requestNewInvite("dead-1"), { ok: true }, "second ask is swallowed, not an error");
    const [inv] = await db.select().from(invites).where(eq(invites.token, "dead-1"));
    assert.equal(await countRecent(`invite-renew:${inv.id}`, LIMITS.inviteRenew), 1, "only one email went out");
    assert.match((await requestNewInvite("no-such"))?.error ?? "", /invite\.error\.invalid/);
  });
});
