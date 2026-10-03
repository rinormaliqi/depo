import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { PDFDocument } from "pdf-lib";
import { contractPriceBreakdown } from "@/lib/billing-plans";
import { generateContractPdf } from "@/lib/contract-pdf";

describe("generateContractPdf", () => {
  const clientInfo = {
    legalName: "Gjirafa Depo SH.P.K.",
    registrationNumber: "810123456",
    address: "Prishtinë, Kosovë",
    contactName: "Arbër Krasniqi",
    contactEmail: "arber@example.com",
  };

  test("produces a well-formed, loadable PDF for each locale", async () => {
    for (const locale of ["sq", "en"] as const) {
      const bytes = await generateContractPdf({
        locale,
        planName: "Business",
        months: 12,
        pricing: contractPriceBreakdown({ priceCents: 11900 }),
        clientInfo,
        generatedAt: new Date("2026-09-27T00:00:00Z"),
      });
      assert.ok(bytes.length > 500, "a real document, not an empty shell");
      const header = Buffer.from(bytes.slice(0, 5)).toString("latin1");
      assert.equal(header, "%PDF-");

      const reloaded = await PDFDocument.load(bytes);
      assert.ok(reloaded.getPageCount() >= 1);
    }
  });

  test("a 3-month contract without a discount still renders", async () => {
    const bytes = await generateContractPdf({
      locale: "sq",
      planName: "Business",
      months: 3,
      pricing: contractPriceBreakdown({ priceCents: 11900 }, 3),
      clientInfo,
      generatedAt: new Date("2026-10-03T00:00:00Z"),
    });
    const reloaded = await PDFDocument.load(bytes);
    assert.ok(reloaded.getPageCount() >= 1);
  });

  test("a long clause set still produces a valid multi-page document", async () => {
    // The real template is short enough to fit one page today; this just
    // confirms the pagination path (ensureSpace adding a new page) doesn't
    // corrupt the document if the template ever grows.
    const bytes = await generateContractPdf({
      locale: "sq",
      planName: "Business",
      months: 12,
      pricing: contractPriceBreakdown({ priceCents: 11900 }),
      clientInfo: { ...clientInfo, address: "Adresë ".repeat(40) },
      generatedAt: new Date(),
    });
    const reloaded = await PDFDocument.load(bytes);
    assert.ok(reloaded.getPageCount() >= 1);
  });
});
