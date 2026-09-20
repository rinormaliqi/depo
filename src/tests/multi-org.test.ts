import { freshDatabase } from "@/test-support/setup";
import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { getCapabilities } from "@/lib/capabilities";
import { acceptInviteViaSession } from "@/lib/onboarding";
import { currentOrganization, organizationCookieName, rememberOrganization } from "@/lib/organizations";
import { getMySession } from "@/lib/session";
import { db } from "@/db";
import { invites } from "@/db/schema";
import { addMember, createOrg, createUser, seedPlans } from "@/test-support/factories";
import { actAs } from "@/test-support/stubs/auth";
import { cookies, resetCookies } from "@/test-support/stubs/next-headers";

// One person, two companies (#74): before, the first membership row won
// silently and a freshly accepted invite was invisible.
describe("multi-organization membership", () => {
  before(async () => {
    await freshDatabase();
    await seedPlans();
    resetCookies();
  });

  test("the current organization is the cookie's when valid, else the most recently joined", async () => {
    const { org: first } = await createOrg({ planKey: "business" });
    const user = await addMember(first.id, "admin");
    actAs(user);
    assert.equal((await getMySession())?.organizationId, first.id);

    const { org: second } = await createOrg({ planKey: "starter" });
    await addMember(second.id, "worker", user);
    assert.equal((await currentOrganization(user.id))?.id, second.id, "most recent membership by default");
    assert.equal((await getMySession())?.role, "worker");

    await rememberOrganization(first.id);
    assert.equal((await getMySession())?.organizationId, first.id);
    assert.equal((await getMySession())?.role, "admin");
    assert.equal((await getCapabilities())?.plan.key, "business", "capabilities follow the chosen org");

    (await cookies()).set(organizationCookieName, "00000000-0000-0000-0000-000000000000");
    assert.equal((await getMySession())?.organizationId, second.id, "a stale or forged cookie falls back");
    resetCookies();
  });

  test("accepting an invite while a member elsewhere adds the membership and lands in the new company", async () => {
    const { org: home } = await createOrg();
    const contractor = await createUser({ email: "c@example.com", normalizedEmail: "c@example.com" });
    await addMember(home.id, "admin", contractor);
    const { org: client } = await createOrg();
    const clientAdmin = await addMember(client.id, "admin");
    await db.insert(invites).values({ organizationId: client.id, email: "c@example.com", role: "worker", token: "m-1", invitedBy: clientAdmin.id, expiresAt: new Date(Date.now() + 86_400_000) });

    actAs(contractor);
    assert.equal(await acceptInviteViaSession("m-1", contractor.id), "joined");
    assert.equal((await getMySession())?.organizationId, client.id, "cookie points at the company just joined");
    assert.equal((await getMySession())?.role, "worker");
    await rememberOrganization(home.id);
    assert.equal((await getMySession())?.role, "admin", "the old membership is still there");
    resetCookies();
  });
});
