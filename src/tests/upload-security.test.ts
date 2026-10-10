import { freshDatabase } from "@/test-support/setup";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { before, describe, test } from "node:test";
import { eq } from "drizzle-orm";
import { startContract } from "@/app/billing/contract/actions";
import { GET as getPdf } from "@/app/api/contracts/[contractId]/pdf/route";
import { POST as postSigned } from "@/app/api/contracts/[contractId]/signed/route";
import { POST as postUnderlay } from "@/app/api/builder/underlay/[facilityId]/route";
import { db } from "@/db";
import { contracts } from "@/db/schema";
import { LIMITS } from "@/lib/rate-limit";
import { declaredTooLarge, safeFileName, sniffType } from "@/lib/upload-check";
import { addMember, createOrg, seedPlans } from "@/test-support/factories";
import { actAs } from "@/test-support/stubs/auth";
import { resetCookies } from "@/test-support/stubs/next-headers";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBPVP8 ")]);
const PDF = Buffer.from("%PDF-1.4 signed");
const HTML = Buffer.from("<html><script>alert(1)</script></html>");

const CLIENT_INFO = { legalName: "Shpk Test", registrationNumber: "", address: "Prishtinë", contactName: "Test", contactEmail: "test@example.test" };

// #194: uploads are judged by their bytes, not by the type the sender claims.
describe("upload checks", () => {
  test("sniffType recognises the accepted formats and nothing else", () => {
    assert.equal(sniffType(PNG), "image/png");
    assert.equal(sniffType(JPEG), "image/jpeg");
    assert.equal(sniffType(WEBP), "image/webp");
    assert.equal(sniffType(PDF), "application/pdf");
    assert.equal(sniffType(HTML), null);
    assert.equal(sniffType(Buffer.from("MZ\x90\x00")), null); // a Windows executable
    assert.equal(sniffType(new Uint8Array()), null);
  });

  test("safeFileName drops paths and control characters and forces the real extension", () => {
    assert.equal(safeFileName("../../etc/passwd", "application/pdf", "x"), "passwd.pdf");
    assert.equal(safeFileName("C:\\Users\\me\\kontrata.pdf", "application/pdf", "x"), "kontrata.pdf");
    assert.equal(safeFileName("invoice.pdf.exe", "application/pdf", "x"), "invoice.pdf.pdf");
    assert.equal(safeFileName('a"b<c>\r\nd.png', "image/png", "x"), "abcd.png");
    assert.equal(safeFileName("", "image/jpeg", "kontrata"), "kontrata.jpg");
    assert.equal(safeFileName("x".repeat(300) + ".pdf", "application/pdf", "f").length, 84);
  });

  test("declaredTooLarge refuses on Content-Length before reading the body", () => {
    const req = (n: string | null) => new Request("http://test.local", { method: "POST", headers: n === null ? {} : { "content-length": n } });
    assert.equal(declaredTooLarge(req(String(10 * 1024 * 1024)), 4 * 1024 * 1024), true);
    assert.equal(declaredTooLarge(req(String(4 * 1024 * 1024)), 4 * 1024 * 1024), false);
    assert.equal(declaredTooLarge(req(null), 4 * 1024 * 1024), false);
  });
});

describe("signed contract upload", () => {
  let org: Awaited<ReturnType<typeof createOrg>>;
  let admin: Awaited<ReturnType<typeof addMember>>;

  before(async () => {
    resetCookies();
    await freshDatabase();
    await seedPlans();
    org = await createOrg();
    admin = await addMember(org.org.id, "admin");
  });

  async function newContract() {
    actAs(admin);
    const started = await startContract("business", 12, CLIENT_INFO);
    assert.ok(started.ok);
    return started.value.contractId;
  }
  function upload(contractId: string, bytes: Buffer, type: string, name: string) {
    const form = new FormData();
    form.set("file", new Blob([new Uint8Array(bytes)], { type }), name);
    return postSigned(new Request("http://test.local", { method: "POST", body: form }), { params: Promise.resolve({ contractId }) });
  }

  test("a file whose bytes aren't the type it claims is refused", async () => {
    const id = await newContract();
    assert.equal((await upload(id, HTML, "application/pdf", "kontrata.pdf")).status, 415);
    assert.equal((await upload(id, PNG, "application/pdf", "kontrata.pdf")).status, 415);
    const [row] = await db.select().from(contracts).where(eq(contracts.id, id));
    assert.notEqual(row.status, "signed");
  });

  test("the stored name has no path and the real type's extension", async () => {
    const id = await newContract();
    assert.equal((await upload(id, PDF, "application/pdf", "../../nënshkruar.exe")).status, 200);
    const [row] = await db.select().from(contracts).where(eq(contracts.id, id));
    assert.equal(row.signedFileName, "nënshkruar.pdf");
  });

  test("uploads per company are rate-limited", async () => {
    const id = await newContract();
    // One upload already counted above; fill the rest of the window.
    for (let i = 1; i < LIMITS.signedContract.max; i++) assert.equal((await upload(id, PDF, "application/pdf", "k.pdf")).status, 200);
    assert.equal((await upload(id, PDF, "application/pdf", "k.pdf")).status, 429);
  });

  test("the contract PDF is for billing managers, not every member", async () => {
    const id = await newContract();
    actAs(await addMember(org.org.id, "worker"));
    const res = await getPdf(new Request("http://test.local"), { params: Promise.resolve({ contractId: id }) });
    assert.equal(res.status, 403);
  });
});

describe("underlay upload", () => {
  let org: Awaited<ReturnType<typeof createOrg>>;

  before(async () => {
    resetCookies();
    await freshDatabase();
    org = await createOrg();
    actAs(await addMember(org.org.id, "admin"));
  });

  function upload(bytes: Buffer, type: string, w = 800, h = 600) {
    const form = new FormData();
    form.set("file", new Blob([new Uint8Array(bytes)], { type }), "plan");
    form.set("widthPx", String(w));
    form.set("heightPx", String(h));
    return postUnderlay(new Request("http://test.local", { method: "POST", body: form }), { params: Promise.resolve({ facilityId: org.facility.id }) });
  }

  test("an image is stored only when its bytes match its type", async () => {
    assert.equal((await upload(PNG, "image/png")).status, 200);
    assert.equal((await upload(HTML, "image/png")).status, 415);
    assert.equal((await upload(JPEG, "image/png")).status, 415);
  });

  test("dimensions past what the browser ever sends are refused", async () => {
    assert.equal((await upload(PNG, "image/png", 99999, 600)).status, 400);
  });
});

// #194: every export of a "use server" file is a server action anyone with
// a session can call with arguments of their choosing. A helper that trusts
// the organizationId it is handed — instead of reading it from the session —
// must not be one of them. buildBlueprintData (no ownership check at all)
// and items' requireOwnedItem were.
describe("server action surface", () => {
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      if (statSync(p).isDirectory()) return n === "tests" ? [] : sourceFiles(p);
      return /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
    });
  }
  const actionFiles = sourceFiles(join(process.cwd(), "src")).filter((f) => /^\s*["']use server["']/.test(readFileSync(f, "utf8")));

  // Each of these checks that the caller belongs to (or administers) the
  // organization before using it.
  const verifiesTheOrgItself = new Set(["switchOrganization", "startViewAs"]);

  test("no server action takes the organization to act on from its caller", () => {
    const offenders = actionFiles.flatMap((f) =>
      [...readFileSync(f, "utf8").matchAll(/export async function (\w+)\s*\(([^)]*)\)/g)]
        .filter(([, name, params]) => /\borganizationId\b/.test(params) && !verifiesTheOrgItself.has(name))
        .map(([, name]) => `${f.replace(process.cwd() + "/", "")}: ${name}`),
    );
    assert.deepEqual(offenders, []);
  });

  test("the unchecked blueprint query is not a server action", () => {
    const exported = actionFiles.filter((f) => /export async function buildBlueprintData\b/.test(readFileSync(f, "utf8")));
    assert.deepEqual(exported, []);
  });
});
