import { freshDatabase } from "@/test-support/setup";
import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { GET as getPdf } from "@/app/api/contracts/[contractId]/pdf/route";
import { POST as postSigned } from "@/app/api/contracts/[contractId]/signed/route";
import { getMyContractsForOrg, startContract } from "@/app/billing/contract/actions";
import { db } from "@/db";
import { contracts, plans } from "@/db/schema";
import { contractPriceBreakdown } from "@/lib/billing-plans";
import { createContract } from "@/lib/contracts";
import { addMember, createOrg, seedPlans } from "@/test-support/factories";
import { actAs } from "@/test-support/stubs/auth";
import { resetCookies } from "@/test-support/stubs/next-headers";

const CLIENT_INFO = {
  legalName: "Gjirafa Depo SH.P.K.",
  registrationNumber: "810123456",
  address: "Prishtinë, Kosovë",
  contactName: "Arbër Krasniqi",
  contactEmail: "arber@example.com",
};

describe("createContract", () => {
  let org: Awaited<ReturnType<typeof createOrg>>;

  before(async () => {
    await freshDatabase();
    await seedPlans();
    org = await createOrg();
  });

  test("freezes the business plan's current price into a 2-months-free breakdown", async () => {
    const [business] = await db.select().from(plans).where(eq(plans.key, "business"));
    const admin = await addMember(org.org.id, "admin");
    const row = await createContract(org.org.id, admin.id, { planKey: "business", months: 12, clientInfo: CLIENT_INFO });
    assert.deepEqual(row.pricingSnapshot, contractPriceBreakdown(business));
    assert.equal(row.status, "draft");
    assert.equal(row.months, 12);
  });

  test("3- and 6-month contracts freeze the full price, no discount", async () => {
    const [business] = await db.select().from(plans).where(eq(plans.key, "business"));
    const admin = await addMember(org.org.id, "admin");
    for (const months of [3, 6] as const) {
      const row = await createContract(org.org.id, admin.id, { planKey: "business", months, clientInfo: CLIENT_INFO });
      assert.equal(row.months, months);
      assert.equal(row.pricingSnapshot.discountCents, 0);
      assert.equal(row.pricingSnapshot.finalTotalCents, business.priceCents * months);
    }
  });

  test("periods other than 3, 6 or 12 are refused", async () => {
    const admin = await addMember(org.org.id, "admin");
    await assert.rejects(createContract(org.org.id, admin.id, { planKey: "business", months: 1, clientInfo: CLIENT_INFO }));
    await assert.rejects(createContract(org.org.id, admin.id, { planKey: "business", months: 24, clientInfo: CLIENT_INFO }));
  });

  test("starter and enterprise are not eligible for the automated contract flow", async () => {
    const admin = await addMember(org.org.id, "admin");
    await assert.rejects(createContract(org.org.id, admin.id, { planKey: "starter", months: 12, clientInfo: CLIENT_INFO }));
    await assert.rejects(createContract(org.org.id, admin.id, { planKey: "enterprise", months: 12, clientInfo: CLIENT_INFO }));
  });

  test("required client fields are enforced; registration number is not", async () => {
    const admin = await addMember(org.org.id, "admin");
    await assert.rejects(createContract(org.org.id, admin.id, { planKey: "business", months: 12, clientInfo: { ...CLIENT_INFO, legalName: "  " } }));
    await assert.doesNotReject(createContract(org.org.id, admin.id, { planKey: "business", months: 12, clientInfo: { ...CLIENT_INFO, registrationNumber: "" } }));
  });
});

describe("contract server actions and routes", () => {
  let org: Awaited<ReturnType<typeof createOrg>>;
  let otherOrg: Awaited<ReturnType<typeof createOrg>>;
  let admin: Awaited<ReturnType<typeof addMember>>;

  before(async () => {
    resetCookies();
    await freshDatabase();
    await seedPlans();
    org = await createOrg();
    otherOrg = await createOrg();
    admin = await addMember(org.org.id, "admin");
  });

  test("a worker cannot start a contract", async () => {
    actAs(await addMember(org.org.id, "worker"));
    const result = await startContract("business", 12, CLIENT_INFO);
    assert.equal(result.ok, false);
  });

  test("an admin starts a contract and can list it back", async () => {
    actAs(admin);
    const started = await startContract("business", 12, CLIENT_INFO);
    assert.ok(started.ok);
    const list = await getMyContractsForOrg();
    assert.equal(list.length, 1);
    assert.equal(list[0].id, started.value.contractId);
  });

  test("the PDF route serves the owner's contract but 404s for another org", async () => {
    actAs(admin);
    const [contract] = await getMyContractsForOrg();

    actAs(admin);
    const ok = await getPdf(new Request("http://test.local"), { params: Promise.resolve({ contractId: contract.id }) });
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get("Content-Type"), "application/pdf");
    const bytes = new Uint8Array(await ok.arrayBuffer());
    assert.equal(Buffer.from(bytes.slice(0, 5)).toString("latin1"), "%PDF-");

    actAs(await addMember(otherOrg.org.id, "admin"));
    const forbidden = await getPdf(new Request("http://test.local"), { params: Promise.resolve({ contractId: contract.id }) });
    assert.equal(forbidden.status, 404);
  });

  test("uploading a signed contract marks it signed and stores the file", async () => {
    actAs(admin);
    const [contract] = await getMyContractsForOrg();

    const form = new FormData();
    form.set("file", new Blob([Buffer.from("%PDF-1.4 fake contract bytes")], { type: "application/pdf" }), "signed.pdf");
    const res = await postSigned(new Request("http://test.local", { method: "POST", body: form }), {
      params: Promise.resolve({ contractId: contract.id }),
    });
    assert.equal(res.status, 200);

    const [row] = await db.select().from(contracts).where(and(eq(contracts.id, contract.id)));
    assert.equal(row.status, "signed");
    assert.equal(row.signedFileName, "signed.pdf");
    assert.ok(row.signedAt);
    assert.ok(row.signedFileData && row.signedFileData.length > 0);
  });

  test("an oversized or wrong-type upload is refused", async () => {
    actAs(admin);
    const started = await startContract("business", 12, CLIENT_INFO);
    assert.ok(started.ok);
    const contractId = started.value.contractId;

    const badType = new FormData();
    badType.set("file", new Blob([Buffer.from("hello")], { type: "text/plain" }), "notes.txt");
    const badTypeRes = await postSigned(new Request("http://test.local", { method: "POST", body: badType }), {
      params: Promise.resolve({ contractId }),
    });
    assert.equal(badTypeRes.status, 415);

    const tooBig = new FormData();
    tooBig.set("file", new Blob([Buffer.alloc(9 * 1024 * 1024)], { type: "application/pdf" }), "big.pdf");
    const tooBigRes = await postSigned(new Request("http://test.local", { method: "POST", body: tooBig }), {
      params: Promise.resolve({ contractId }),
    });
    assert.equal(tooBigRes.status, 413);
  });

  test("a worker cannot upload a signed contract even for their own org", async () => {
    actAs(admin);
    const started = await startContract("business", 12, CLIENT_INFO);
    assert.ok(started.ok);
    const contractId = started.value.contractId;

    actAs(await addMember(org.org.id, "worker"));
    const form = new FormData();
    form.set("file", new Blob([Buffer.from("%PDF-1.4")], { type: "application/pdf" }), "signed.pdf");
    const res = await postSigned(new Request("http://test.local", { method: "POST", body: form }), { params: Promise.resolve({ contractId }) });
    assert.equal(res.status, 403);
  });
});
