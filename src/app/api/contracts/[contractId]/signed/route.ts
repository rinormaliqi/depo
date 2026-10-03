import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { organizations, plans } from "@/db/schema";
import { getCapabilities } from "@/lib/capabilities";
import { companyInfo } from "@/lib/company";
import { getOwnedContract, markContractSigned } from "@/lib/contracts";
import { SIGNED_CONTRACT_MAX_BYTES, SIGNED_CONTRACT_MIME } from "@/lib/contracts-shared";
import { sendEmail } from "@/lib/email";
import { getMyOrgId } from "@/lib/session";

// Step 3→4 of Epic #7 in one request: the customer uploads their signed
// copy, it's stored, and SmartDepo is emailed it immediately — a route
// handler, not a server action, because the upload itself is a multipart
// file past what an action's body accepts (same reasoning as the
// underlay/custom-fields upload routes).
export async function POST(req: Request, { params }: { params: Promise<{ contractId: string }> }) {
  const { contractId } = await params;
  const organizationId = await getMyOrgId();
  if (!organizationId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const caps = await getCapabilities();
  if (!caps?.can.manageBilling) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const contract = await getOwnedContract(contractId, organizationId);
  if (!contract) return NextResponse.json({ error: "notFound" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof Blob)) return NextResponse.json({ error: "noFile" }, { status: 400 });
  if (!(SIGNED_CONTRACT_MIME as readonly string[]).includes(file.type)) return NextResponse.json({ error: "badType" }, { status: 415 });
  if (file.size > SIGNED_CONTRACT_MAX_BYTES) return NextResponse.json({ error: "tooLarge" }, { status: 413 });

  const fileName = file instanceof File && file.name ? file.name : "kontrata-nenshkruar";
  const data = Buffer.from(await file.arrayBuffer());
  await markContractSigned(contractId, { name: fileName, mimeType: file.type, data });

  const [org] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, organizationId));
  const [plan] = await db.select({ name: plans.name }).from(plans).where(eq(plans.id, contract.planId));
  const { finalTotalCents } = contract.pricingSnapshot;

  try {
    await sendEmail({
      to: companyInfo().supportEmail,
      replyTo: contract.clientInfo.contactEmail,
      subject: `[SmartDepo] Signed ${contract.months}-month contract — ${org?.name ?? organizationId}`,
      text: [
        `${org?.name ?? "?"} uploaded a signed ${contract.months}-month contract.`,
        `Plan: ${plan?.name ?? contract.planId}`,
        `Total due: €${(finalTotalCents / 100).toFixed(2)}`,
        `Client: ${contract.clientInfo.legalName} (${contract.clientInfo.registrationNumber || "no reg. no."})`,
        `Address: ${contract.clientInfo.address}`,
        `Contact: ${contract.clientInfo.contactName} <${contract.clientInfo.contactEmail}>`,
        `Contract id: ${contractId}`,
        `Organization id: ${organizationId}`,
      ].join("\n"),
      attachments: [{ filename: fileName, content: data, contentType: file.type }],
    });
  } catch (e) {
    // The signed copy is already stored either way — a failed notice email
    // doesn't lose it, it just means support finds out from the customer
    // instead of the inbox, so this isn't surfaced as a failure to them.
    console.error("[contracts] signed-notice email failed", e);
  }

  return NextResponse.json({ ok: true });
}
