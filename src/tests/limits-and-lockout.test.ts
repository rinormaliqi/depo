import { freshDatabase } from "@/test-support/setup";
import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { invites, payments } from "@/db/schema";
import { applyPaidPayment } from "@/lib/billing";
import { limitsExceeded } from "@/lib/billing-plans";
import { requirePermission } from "@/lib/permissions";
import { getCapabilitiesFor, requireCapability } from "@/lib/capabilities";
import { assertCanAddBins, assertCanAddFacilities, assertCanAddSeats } from "@/lib/plan-limits";
import { getOrgLockReason } from "@/lib/session";
import { addMember, createBin, createOrg, orgById, seedPlans } from "@/test-support/factories";
import { actAs } from "@/test-support/stubs/auth";

const DAY = 86_400_000;

describe("plan limits", () => {
  before(freshDatabase);

  test("bins: usage + additional must stay within max_bins; unlimited plans never block", async () => {
    const starter = await createOrg({ planKey: "starter" }); // 500 bins
    for (let i = 0; i < 3; i++) await createBin(starter.facility.id, `S-${i}`);
    await assert.doesNotReject(assertCanAddBins(starter.org.id, 497));
    await assert.rejects(assertCanAddBins(starter.org.id, 498), /planLimit\.bins/);
    const ent = await createOrg({ planKey: "enterprise" });
    await assert.doesNotReject(assertCanAddBins(ent.org.id, 1_000_000));
  });

  test("seats: pending unexpired invites count as taken", async () => {
    const starter = await createOrg({ planKey: "starter" }); // 5 users
    const admin = await addMember(starter.org.id, "admin");
    await addMember(starter.org.id, "worker");
    await db.insert(invites).values([
      { organizationId: starter.org.id, email: "p1@x.com", role: "worker", token: "t1", invitedBy: admin.id, expiresAt: new Date(Date.now() + DAY) },
      { organizationId: starter.org.id, email: "p2@x.com", role: "worker", token: "t2", invitedBy: admin.id, expiresAt: new Date(Date.now() - DAY) }, // expired: not counted
    ]);
    // 2 members + 1 live invite = 3 of 5
    await assert.doesNotReject(assertCanAddSeats(starter.org.id, 2));
    await assert.rejects(assertCanAddSeats(starter.org.id, 3), /planLimit\.users/);
  });

  test("facilities: Starter gets one, Business three", async () => {
    const starter = await createOrg({ planKey: "starter" });
    await assert.rejects(assertCanAddFacilities(starter.org.id, 1), /planLimit\.facilities/);
    const business = await createOrg({ planKey: "business" });
    await assert.doesNotReject(assertCanAddFacilities(business.org.id, 2));
    await assert.rejects(assertCanAddFacilities(business.org.id, 3), /planLimit\.facilities/);
  });

  test("limitsExceeded names what blocks a downgrade", () => {
    assert.deepEqual(limitsExceeded({ maxUsers: 5, maxFacilities: 1, maxBins: 500 }, { users: 6, facilities: 2, bins: 10 }), ["users", "facilities"]);
  });
});

describe("lockout", () => {
  before(freshDatabase);

  test("every non-paying state is read-only, active is not", async () => {
    const cases: [Parameters<typeof createOrg>[0], string | null][] = [
      [{ status: "trialing", trialEndsAt: null }, "unverified"],
      [{ status: "trialing", trialEndsAt: new Date(Date.now() + DAY) }, null],
      [{ status: "trialing", trialEndsAt: new Date(Date.now() - 1000) }, "trialEnded"],
      [{ status: "active", paidUntil: new Date(Date.now() + DAY) }, null],
      [{ status: "active", paidUntil: null }, null], // founder override: paid indefinitely
      [{ status: "active", paidUntil: new Date(Date.now() - 1000) }, "expired"],
      [{ status: "past_due" }, "pastDue"],
      [{ status: "canceled" }, "canceled"],
    ];
    for (const [opts, expected] of cases) {
      const { org } = await createOrg(opts);
      assert.equal(await getOrgLockReason(org.id), expected, JSON.stringify(opts));
    }
  });

  test("requirePermission enforces both the lock and the role", async () => {
    const { org } = await createOrg();
    const worker = await addMember(org.id, "worker");
    const manager = await addMember(org.id, "manager");
    const admin = await addMember(org.id, "admin");

    actAs(worker);
    await assert.rejects(requirePermission("editLayout"), /permission\.editLayout/);
    await assert.doesNotReject(requirePermission("moveStock"));
    actAs(manager);
    await assert.doesNotReject(requirePermission("editLayout"));
    await assert.rejects(requirePermission("manageBilling"), /permission\.manageBilling/);
    actAs(admin);
    await assert.doesNotReject(requirePermission("manageBilling"));

    const locked = await createOrg({ status: "trialing", trialEndsAt: new Date(Date.now() - 1000) });
    const lockedAdmin = await addMember(locked.org.id, "admin");
    actAs(lockedAdmin);
    await assert.rejects(requirePermission("editLayout"), /orgLocked\.trialEnded/);
  });
});

describe("applyPaidPayment", () => {
  before(freshDatabase);

  async function pay(orgId: string, planId: string, months: number) {
    const [p] = await db.insert(payments).values({ organizationId: orgId, planId, months, amountCents: 1, currency: "EUR", provider: "manual" }).returning();
    return p;
  }

  test("first payment on a trial activates from now and clears the trial", async () => {
    const { org, plan } = await createOrg({ planKey: "business" });
    const p = await pay(org.id, plan.id, 3);
    const before = Date.now();
    await applyPaidPayment(p.id);
    const after = await orgById(org.id);
    assert.equal(after.subscriptionStatus, "active");
    assert.equal(after.trialEndsAt, null);
    const expected = new Date(before); expected.setMonth(expected.getMonth() + 3);
    assert.ok(Math.abs(after.paidUntil!.getTime() - expected.getTime()) < 5000);
  });

  test("paying again on the same plan extends from the current paid_until", async () => {
    const paidUntil = new Date(Date.now() + 40 * DAY);
    const { org, plan } = await createOrg({ planKey: "business", status: "active", paidUntil });
    await applyPaidPayment((await pay(org.id, plan.id, 1)).id);
    const after = await orgById(org.id);
    const expected = new Date(paidUntil); expected.setMonth(expected.getMonth() + 1);
    assert.equal(after.paidUntil!.getTime(), expected.getTime());
  });

  test("changing plan starts a fresh period from now", async () => {
    const plans = await seedPlans();
    const { org } = await createOrg({ planKey: "starter", status: "active", paidUntil: new Date(Date.now() + 40 * DAY) });
    await applyPaidPayment((await pay(org.id, plans.business.id, 1)).id);
    const after = await orgById(org.id);
    assert.equal(after.planId, plans.business.id);
    assert.ok(after.paidUntil!.getTime() < Date.now() + 32 * DAY, "not chained onto the old plan's period");
  });

  test("is idempotent per payment row", async () => {
    const { org, plan } = await createOrg({ planKey: "business" });
    const p = await pay(org.id, plan.id, 1);
    await applyPaidPayment(p.id);
    const once = (await orgById(org.id)).paidUntil!.getTime();
    await applyPaidPayment(p.id);
    assert.equal((await orgById(org.id)).paidUntil!.getTime(), once);
    const [row] = await db.select().from(payments).where(eq(payments.id, p.id));
    assert.equal(row.status, "paid");
  });
});

describe("capabilities (server)", () => {
  before(freshDatabase);

  test("requireCapability gates features by plan and role, and usage feeds the limits", async () => {
    const { org } = await createOrg({ planKey: "starter" });
    const admin = await addMember(org.id, "admin");
    const worker = await addMember(org.id, "worker");

    actAs(admin);
    await assert.doesNotReject(requireCapability("printLabels"));
    await assert.rejects(requireCapability("multiFacility"), /capability\.plan\.multiFacility/, "Starter has one facility");
    actAs(worker);
    await assert.rejects(requireCapability("multiFacility"), /permission\.multiFacility/, "role is explained before plan");

    const caps = await getCapabilitiesFor(org.id, "admin");
    assert.deepEqual(caps.limits.users, { used: 2, max: 5 });
    assert.deepEqual(caps.limits.facilities, { used: 1, max: 1 });
    assert.equal(caps.plan.key, "starter");
  });
});
