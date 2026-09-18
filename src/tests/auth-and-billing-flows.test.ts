import { freshDatabase } from "@/test-support/setup";
import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { GET as payseraCallback } from "@/app/api/billing/paysera/callback/route";
import { acceptInviteAsNewUser } from "@/app/invite/[token]/actions";
import { signUp } from "@/app/signup/actions";
import { db } from "@/db";
import { emailVerifications, invites, memberships, payments, users } from "@/db/schema";
import { consumeVerificationToken } from "@/lib/email-verification";
import { encodeSafeBase64 } from "@/lib/paysera";
import { addMember, createOrg, orgById, seedPlans } from "@/test-support/factories";
import { signIns } from "@/test-support/stubs/auth";

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

// signUp() ends in signIn(), which (like production) throws a redirect —
// so "success" here is "threw NEXT_REDIRECT after writing the rows".
async function runSignup(fields: Record<string, string>) {
  try {
    return await signUp(undefined, form(fields));
  } catch (e) {
    if ((e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) return "redirected" as const;
    throw e;
  }
}

describe("signup and email verification", () => {
  before(async () => {
    await freshDatabase();
    await seedPlans();
  });

  test("a fresh signup is unverified, its org has no trial end, and a verification token exists", async () => {
    const result = await runSignup({ name: "Vera", companyName: "Vera Co", email: "Vera.Test+a@Gmail.com", password: "password123" });
    assert.equal(result, "redirected");
    const [user] = await db.select().from(users).where(eq(users.email, "vera.test+a@gmail.com"));
    assert.equal(user.normalizedEmail, "veratest@gmail.com");
    assert.equal(user.emailVerifiedAt, null);
    const [m] = await db.select().from(memberships).where(eq(memberships.userId, user.id));
    assert.equal(m.role, "admin");
    const org = await orgById(m.organizationId);
    assert.equal(org.subscriptionStatus, "trialing");
    assert.equal(org.trialEndsAt, null, "trial must not start before verification");
    const [v] = await db.select().from(emailVerifications).where(eq(emailVerifications.userId, user.id));
    assert.ok(v && v.usedAt === null);
    assert.equal(signIns.length, 1);
  });

  test("aliases of an existing inbox and disposable domains cannot sign up", async () => {
    assert.deepEqual(await runSignup({ name: "X", companyName: "X", email: "veratest@gmail.com", password: "password123" }), { error: "auth.signup.errorEmailExists" });
    assert.deepEqual(await runSignup({ name: "X", companyName: "X", email: "v.e.r.a.test+b@gmail.com", password: "password123" }), { error: "auth.signup.errorEmailExists" });
    assert.deepEqual(await runSignup({ name: "X", companyName: "X", email: "someone@mailinator.com", password: "password123" }), { error: "auth.signup.errorDisposableEmail" });
  });

  test("consuming the token verifies the user, starts a 30-day trial, and is single-use", async () => {
    const [user] = await db.select().from(users).where(eq(users.email, "vera.test+a@gmail.com"));
    const [v] = await db.select().from(emailVerifications).where(and(eq(emailVerifications.userId, user.id), isNull(emailVerifications.usedAt)));
    const before = Date.now();
    assert.deepEqual(await consumeVerificationToken(v.token), { userId: user.id });
    const [after] = await db.select().from(users).where(eq(users.id, user.id));
    assert.ok(after.emailVerifiedAt);
    const [m] = await db.select().from(memberships).where(eq(memberships.userId, user.id));
    const org = await orgById(m.organizationId);
    const days = (org.trialEndsAt!.getTime() - before) / 86_400_000;
    assert.ok(days > 29.9 && days < 30.1, `trial is ${days} days`);
    assert.equal(await consumeVerificationToken(v.token), null, "second use refused");
    assert.equal(await consumeVerificationToken("nonsense"), null);
  });
});

describe("invite acceptance", () => {
  before(freshDatabase);

  test("a new user joins with the invited role, verified, and the invite is consumed", async () => {
    const { org } = await createOrg();
    const admin = await addMember(org.id, "admin");
    const token = "invite-token-1";
    await db.insert(invites).values({ organizationId: org.id, email: "new.worker@example.com", role: "worker", token, invitedBy: admin.id, expiresAt: new Date(Date.now() + 86_400_000) });

    let result: unknown;
    try {
      result = await acceptInviteAsNewUser(undefined, form({ token, name: "New Worker", password: "password123" }));
    } catch (e) {
      result = (e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT") ? "redirected" : e;
    }
    assert.equal(result, "redirected");
    const [user] = await db.select().from(users).where(eq(users.email, "new.worker@example.com"));
    assert.ok(user.emailVerifiedAt, "an accepted invite counts as verification");
    const [m] = await db.select().from(memberships).where(eq(memberships.userId, user.id));
    assert.equal(m.organizationId, org.id);
    assert.equal(m.role, "worker");
    const [inv] = await db.select().from(invites).where(eq(invites.token, token));
    assert.ok(inv.acceptedAt);
    assert.deepEqual(await acceptInviteAsNewUser(undefined, form({ token, name: "Again", password: "password123" })), { error: "invite.error.invalid" });
  });

  test("an expired invite is refused", async () => {
    const { org } = await createOrg();
    const admin = await addMember(org.id, "admin");
    await db.insert(invites).values({ organizationId: org.id, email: "late@example.com", role: "worker", token: "expired-1", invitedBy: admin.id, expiresAt: new Date(Date.now() - 1000) });
    assert.deepEqual(await acceptInviteAsNewUser(undefined, form({ token: "expired-1", name: "Late", password: "password123" })), { error: "invite.error.invalid" });
  });
});

describe("Paysera callback", () => {
  const PROJECT = "12345";
  const PASSWORD = "test-sign-password";

  before(async () => {
    await freshDatabase();
    process.env.PAYSERA_PROJECT_ID = PROJECT;
    process.env.PAYSERA_SIGN_PASSWORD = PASSWORD;
    process.env.PAYSERA_TEST_MODE = "1";
  });

  function callback(fields: Record<string, string>, password = PASSWORD) {
    const data = encodeSafeBase64(new URLSearchParams({ projectid: PROJECT, test: "1", ...fields }).toString());
    const ss1 = createHash("md5").update(data + password).digest("hex");
    return payseraCallback(new Request(`http://test.local/api/billing/paysera/callback?data=${encodeURIComponent(data)}&ss1=${ss1}`));
  }

  async function pendingPayment(orgId: string, planId: string, amountCents: number) {
    const [p] = await db.insert(payments).values({ organizationId: orgId, planId, months: 1, amountCents, currency: "EUR", provider: "paysera" }).returning();
    return p;
  }

  test("a correctly signed status=1 callback activates the org; replay is a no-op", async () => {
    const { org, plan } = await createOrg();
    const p = await pendingPayment(org.id, plan.id, 11900);
    const res = await callback({ orderid: p.id, status: "1", payamount: "11900", paycurrency: "EUR", requestid: "R1" });
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "OK");
    let after = await orgById(org.id);
    assert.equal(after.subscriptionStatus, "active");
    const paidUntil = after.paidUntil!.getTime();
    const [row] = await db.select().from(payments).where(eq(payments.id, p.id));
    assert.equal(row.status, "paid");
    assert.equal(row.providerReference, "R1");

    await callback({ orderid: p.id, status: "1", payamount: "11900", paycurrency: "EUR", requestid: "R1" });
    after = await orgById(org.id);
    assert.equal(after.paidUntil!.getTime(), paidUntil, "replay did not extend");
  });

  test("bad signature is rejected and grants nothing", async () => {
    const { org, plan } = await createOrg();
    const p = await pendingPayment(org.id, plan.id, 11900);
    const res = await callback({ orderid: p.id, status: "1", payamount: "11900", paycurrency: "EUR" }, "wrong");
    assert.equal(res.status, 400);
    assert.equal((await orgById(org.id)).subscriptionStatus, "trialing");
  });

  test("wrong amount marks the payment failed; test-mode mismatch is ignored", async () => {
    const { org, plan } = await createOrg();
    const p = await pendingPayment(org.id, plan.id, 11900);
    await callback({ orderid: p.id, status: "1", payamount: "100", paycurrency: "EUR" });
    let [row] = await db.select().from(payments).where(eq(payments.id, p.id));
    assert.equal(row.status, "failed");
    assert.equal((await orgById(org.id)).subscriptionStatus, "trialing");

    const p2 = await pendingPayment(org.id, plan.id, 11900);
    const res = await callback({ orderid: p2.id, status: "1", payamount: "11900", paycurrency: "EUR", test: "0" });
    assert.equal(await res.text(), "OK", "still answered OK so Paysera stops retrying");
    [row] = await db.select().from(payments).where(eq(payments.id, p2.id));
    assert.equal(row.status, "pending");
  });

  test("status=0 fails a pending payment; unknown order is answered OK", async () => {
    const { org, plan } = await createOrg();
    const p = await pendingPayment(org.id, plan.id, 11900);
    await callback({ orderid: p.id, status: "0" });
    const [row] = await db.select().from(payments).where(eq(payments.id, p.id));
    assert.equal(row.status, "failed");
    const res = await callback({ orderid: "00000000-0000-0000-0000-000000000000", status: "1" });
    assert.equal(await res.text(), "OK");
    assert.equal((await orgById(org.id)).subscriptionStatus, "trialing");
  });
});
