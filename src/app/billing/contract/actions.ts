"use server";

import { revalidatePath } from "next/cache";
import { attempt } from "@/lib/action-result";
import { createContract, getMyContracts, type ClientInfo } from "@/lib/contracts";
import { requirePermission } from "@/lib/permissions";
import { requireSession } from "@/lib/session";

export async function getMyContractsForOrg() {
  const { organizationId } = await requireSession();
  return getMyContracts(organizationId);
}

async function startContractImpl(planKey: string, clientInfo: ClientInfo) {
  const { organizationId, userId } = await requirePermission("manageBilling");
  const row = await createContract(organizationId, userId, { planKey, clientInfo });
  revalidatePath("/billing/contract");
  return { contractId: row.id };
}

export async function startContract(planKey: string, clientInfo: ClientInfo) {
  return attempt(() => startContractImpl(planKey, clientInfo), "startContract");
}
