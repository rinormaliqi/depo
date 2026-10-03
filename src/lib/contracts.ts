import { and, desc, eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import { contracts, plans } from "@/db/schema";
import { CONTRACT_ELIGIBLE_PLAN_KEYS, contractPriceBreakdown, isContractMonths } from "@/lib/billing-plans";
import { UserError } from "@/lib/user-error";

export type ClientInfo = { legalName: string; registrationNumber: string; address: string; contactName: string; contactEmail: string };

// Column-picked, not select(*) — this feeds a Client Component
// (ContractFlow), and signedFileData is a Buffer that React's RSC
// serialization can't carry across that boundary anyway.
export async function getMyContracts(organizationId: string) {
  return db
    .select({
      id: contracts.id,
      status: contracts.status,
      months: contracts.months,
      pricingSnapshot: contracts.pricingSnapshot,
      clientInfo: contracts.clientInfo,
      signedFileName: contracts.signedFileName,
      generatedAt: contracts.generatedAt,
    })
    .from(contracts)
    .where(eq(contracts.organizationId, organizationId))
    .orderBy(desc(contracts.generatedAt));
}

export async function getOwnedContract(contractId: string, organizationId: string) {
  const [row] = await db.select().from(contracts).where(and(eq(contracts.id, contractId), eq(contracts.organizationId, organizationId)));
  return row ?? null;
}

function trimmedOrThrow(value: string, key: string, t: Awaited<ReturnType<typeof getTranslations>>) {
  const v = value.trim();
  if (!v) throw new UserError(t("errorClientFieldRequired", { field: t(`field.${key}`) }));
  return v;
}

// Starting a contract freezes the plan's current price into pricingSnapshot
// — a later price change must never rewrite a contract someone already
// downloaded. Only plans in CONTRACT_ELIGIBLE_PLAN_KEYS have a fixed price
// to freeze at all (Enterprise is negotiated, so it isn't offered here).
// `months` is 3, 6 or 12 — only 12 carries the 2-months-free discount.
export async function createContract(
  organizationId: string,
  userId: string,
  input: { planKey: string; months: number; clientInfo: ClientInfo },
) {
  const t = await getTranslations("contract");
  if (!(CONTRACT_ELIGIBLE_PLAN_KEYS as readonly string[]).includes(input.planKey)) {
    throw new UserError(t("errorPlanNotEligible"));
  }
  if (!isContractMonths(input.months)) throw new UserError(t("errorPeriodNotEligible"));
  const [plan] = await db.select().from(plans).where(and(eq(plans.key, input.planKey), eq(plans.isActive, true)));
  if (!plan) throw new UserError(t("errorPlanNotEligible"));

  const clientInfo: ClientInfo = {
    legalName: trimmedOrThrow(input.clientInfo.legalName, "legalName", t),
    address: trimmedOrThrow(input.clientInfo.address, "address", t),
    contactName: trimmedOrThrow(input.clientInfo.contactName, "contactName", t),
    contactEmail: trimmedOrThrow(input.clientInfo.contactEmail, "contactEmail", t),
    registrationNumber: input.clientInfo.registrationNumber.trim(),
  };

  const pricingSnapshot = contractPriceBreakdown(plan, input.months);
  const [row] = await db
    .insert(contracts)
    .values({ organizationId, planId: plan.id, months: input.months, pricingSnapshot, clientInfo, createdBy: userId })
    .returning();
  return row;
}

export async function markContractSigned(contractId: string, file: { name: string; mimeType: string; data: Buffer }) {
  await db
    .update(contracts)
    .set({ status: "signed", signedAt: new Date(), signedFileName: file.name, signedFileMimeType: file.mimeType, signedFileData: file.data })
    .where(eq(contracts.id, contractId));
}
