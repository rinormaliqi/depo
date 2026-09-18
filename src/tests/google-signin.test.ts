import { freshDatabase } from "@/test-support/setup";
import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { facilities, invites, memberships, users } from "@/db/schema";
import { acceptInviteViaSession, createOrganizationForFounder, ensureUserFromGoogle, hasMembership } from "@/lib/onboarding";
import { addMember, createOrg, createUser, orgById, seedPlans } from "@/test-support/factories";

// The OAuth round-trip itself is Auth.js's; what's ours — and what these
// cover — is everything src/auth.ts's callbacks and /welcome do with the
// profile Google hands back.
describe("sign-up and sign-in with Google", () => {
  before(async () => {
    await freshDatabase();
    await seedPlans();
  });

  test("a new Google identity becomes a verified, password-less user with no organization yet", async () => {
    const user = await ensureUserFromGoogle({ email: "Agron.Krasniqi@Gmail.com", name: "Agron Krasniqi", emailVerified: true });
    assert.ok(user);
    assert.equal(user.email, "agron.krasniqi@gmail.com");
    assert.equal(user.normalizedEmail, "agronkrasniqi@gmail.com");
    assert.equal(user.passwordHash, null);
    assert.ok(user.emailVerifiedAt, "Google vouched for the inbox");
    assert.equal(await hasMembership(user.id), false);
  });

  test("naming the company creates the org, admin membership and facility with the trial already running", async () => {
    const [user] = await db.select().from(users).where(eq(users.normalizedEmail, "agronkrasniqi@gmail.com"));
    const org = await createOrganizationForFounder({ userId: user.id, companyName: "Depo Rinia", emailVerified: true });
    assert.equal(org.subscriptionStatus, "trialing");
    assert.ok(org.trialEndsAt && org.trialEndsAt.getTime() > Date.now() + 29 * 86400_000, "30-day trial starts immediately");
    const [m] = await db.select().from(memberships).where(eq(memberships.userId, user.id));
    assert.equal(m.role, "admin");
    assert.equal(m.organizationId, org.id);
    const [f] = await db.select().from(facilities).where(eq(facilities.organizationId, org.id));
    assert.ok(f);
  });

  test("an address Google has not verified is refused", async () => {
    assert.equal(await ensureUserFromGoogle({ email: "shady@example.com", emailVerified: false }), null);
    assert.equal((await db.select().from(users).where(eq(users.email, "shady@example.com"))).length, 0);
  });

  test("an existing password user signing in with Google gets their own account, not a second one", async () => {
    const { org } = await createOrg({ trialEndsAt: null });
    const existing = await createUser({ email: "vera@example.com", normalizedEmail: "vera@example.com", emailVerifiedAt: null });
    await addMember(org.id, "admin", existing);

    const viaGoogle = await ensureUserFromGoogle({ email: "vera@example.com", name: "Vera G", emailVerified: true });
    assert.equal(viaGoogle?.id, existing.id);
    assert.equal((await db.select().from(users).where(eq(users.normalizedEmail, "vera@example.com"))).length, 1);
    // Google proving the inbox counts as verification: the pending trial starts.
    const [refreshed] = await db.select().from(users).where(eq(users.id, existing.id));
    assert.ok(refreshed.emailVerifiedAt);
    assert.ok((await orgById(org.id)).trialEndsAt, "founder's trial clock started");
    assert.ok(refreshed.passwordHash, "password login still works alongside");
  });

  test("an invite opened while signed in joins only when the session is the invited inbox", async () => {
    const { org } = await createOrg();
    const admin = await createUser();
    await addMember(org.id, "admin", admin);
    await db.insert(invites).values({ organizationId: org.id, email: "New.Worker+depo@gmail.com", role: "worker", token: "g-1", invitedBy: admin.id, expiresAt: new Date(Date.now() + 86_400_000) });

    const stranger = await ensureUserFromGoogle({ email: "someone.else@gmail.com", emailVerified: true });
    assert.equal(await acceptInviteViaSession("g-1", stranger!.id), "mismatch");

    const invited = await ensureUserFromGoogle({ email: "newworker@gmail.com", emailVerified: true });
    assert.equal(await acceptInviteViaSession("g-1", invited!.id), "joined");
    const [m] = await db.select().from(memberships).where(eq(memberships.userId, invited!.id));
    assert.equal(m.role, "worker");
    assert.equal(m.organizationId, org.id);
    const [inv] = await db.select().from(invites).where(eq(invites.token, "g-1"));
    assert.ok(inv.acceptedAt);

    assert.equal(await acceptInviteViaSession("g-1", invited!.id), "invalid", "single use");
    assert.equal(await acceptInviteViaSession("no-such-token", invited!.id), "invalid");
  });
});
