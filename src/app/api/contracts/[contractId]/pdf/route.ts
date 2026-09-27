import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getLocale } from "next-intl/server";
import { db } from "@/db";
import { plans } from "@/db/schema";
import { generateContractPdf } from "@/lib/contract-pdf";
import { getOwnedContract } from "@/lib/contracts";
import { getMyOrgId } from "@/lib/session";

// Regenerated on every request from the contract's frozen pricingSnapshot
// and clientInfo, not stored — deterministic from data already on the
// row, so there's no second blob to ever drift out of sync with it. A
// route handler rather than a server action because the payload is a
// binary file the browser should download, not JSON.
export async function GET(_req: Request, { params }: { params: Promise<{ contractId: string }> }) {
  const { contractId } = await params;
  const organizationId = await getMyOrgId();
  if (!organizationId) return new NextResponse(null, { status: 401 });

  const contract = await getOwnedContract(contractId, organizationId);
  if (!contract) return new NextResponse(null, { status: 404 });

  const [plan] = await db.select().from(plans).where(eq(plans.id, contract.planId));
  const locale = await getLocale();
  const bytes = await generateContractPdf({
    locale: locale === "en" ? "en" : "sq",
    planName: plan?.name ?? "",
    months: contract.months,
    pricing: contract.pricingSnapshot,
    clientInfo: contract.clientInfo,
    generatedAt: contract.generatedAt,
  });

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="smartdepo-kontrata-${contractId.slice(0, 8)}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
