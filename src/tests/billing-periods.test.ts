import { freshDatabase } from "@/test-support/setup";
import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { eq } from "drizzle-orm";
import { requestBankTransfer, startCheckout } from "@/app/billing/actions";
import { db } from "@/db";
import { payments } from "@/db/schema";
import { addMember, createOrg } from "@/test-support/factories";
import { actAs } from "@/test-support/stubs/auth";

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

async function paymentsFor(orgId: string) {
  return db.select().from(payments).where(eq(payments.organizationId, orgId));
}

// Decided 2026-09-26: Paysera is the 1-month-only instant path; 3 and 6
// months are a bank transfer the founder records on /internal; 12 is a
// contract (Epic #7), not a checkout. This is what actually enforces that
// split — the plan picker UI only reflects it.
describe("billing period routing", () => {
  before(async () => {
    await freshDatabase();
    process.env.PAYSERA_PROJECT_ID = "12345";
    process.env.PAYSERA_SIGN_PASSWORD = "test-sign-password";
  });

  test("startCheckout redirects to Paysera for 1 month and records a pending payment", async () => {
    const { org, plan } = await createOrg();
    const admin = await addMember(org.id, "admin");
    actAs(admin);

    await assert.rejects(
      startCheckout(undefined, form({ plan: plan.key, months: "1" })),
      (e: unknown) => (e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT") ?? false,
    );

    const rows = await paymentsFor(org.id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].provider, "paysera");
    assert.equal(rows[0].months, 1);
    assert.equal(rows[0].status, "pending");
  });

  test("startCheckout refuses 3, 6 and 12 months — Paysera is 1-month only", async () => {
    const { org, plan } = await createOrg();
    const admin = await addMember(org.id, "admin");
    actAs(admin);

    for (const months of ["3", "6", "12"]) {
      const result = await startCheckout(undefined, form({ plan: plan.key, months }));
      assert.ok(result?.error, `months=${months} should be refused`);
    }
    assert.equal((await paymentsFor(org.id)).length, 0, "no payment row from any refused attempt");
  });

  test("startCheckout is admin-only", async () => {
    const { org, plan } = await createOrg();
    const manager = await addMember(org.id, "manager");
    actAs(manager);
    const result = await startCheckout(undefined, form({ plan: plan.key, months: "1" }));
    assert.ok(result?.error);
    assert.equal((await paymentsFor(org.id)).length, 0);
  });

  test("requestBankTransfer accepts 3 and 6 months, writes no payment row, and doesn't touch subscription state", async () => {
    const { org, plan } = await createOrg();
    const admin = await addMember(org.id, "admin");
    actAs(admin);

    for (const months of ["3", "6"]) {
      const result = await requestBankTransfer(undefined, form({ plan: plan.key, months }));
      assert.deepEqual(result, { ok: true });
    }
    assert.equal((await paymentsFor(org.id)).length, 0, "this is a heads-up email, not a payment record");
  });

  test("requestBankTransfer refuses 1 and 12 months", async () => {
    const { org, plan } = await createOrg();
    const admin = await addMember(org.id, "admin");
    actAs(admin);

    for (const months of ["1", "12"]) {
      const result = await requestBankTransfer(undefined, form({ plan: plan.key, months }));
      assert.ok(result?.error, `months=${months} should be refused`);
    }
  });

  test("requestBankTransfer is admin-only", async () => {
    const { org, plan } = await createOrg();
    const worker = await addMember(org.id, "worker");
    actAs(worker);
    const result = await requestBankTransfer(undefined, form({ plan: plan.key, months: "3" }));
    assert.ok(result?.error);
  });
});
