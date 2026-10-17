import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { facilities } from "@/db/schema";
import * as capabilities from "@/lib/capabilities";
import * as contracts from "@/lib/contracts";
import * as customFields from "@/lib/custom-fields";
import * as inventory from "@/lib/inventory";
import * as levels from "@/lib/levels";
import * as planLimits from "@/lib/plan-limits";
import * as stock from "@/lib/stock";
import { asOwner } from "@/db/tenant-context";
import { inOrg, withOrg } from "@/lib/tenant";
import { ownerDb } from "./owner-db";

// The company-scoped library functions, for tests to call directly (#228
// phase 3). In the app they only ever run inside withOrg() — an action
// wraps them — so here each runs inside the company named by its own
// organizationId argument, under the same row-level security. Called bare,
// on the restricted connection with no company, they'd see nothing.
export function inCompany<T>(organizationId: string, fn: () => Promise<T>): Promise<T> {
  return withOrg({ organizationId, userId: randomUUID(), role: "admin" }, fn);
}

async function companyOfFacility(facilityId: string) {
  const [f] = await ownerDb.select({ organizationId: facilities.organizationId }).from(facilities).where(eq(facilities.id, facilityId));
  return f.organizationId;
}

type Fn = (...args: never[]) => Promise<unknown>;
// Wrap a function whose company is its argument at `index`.
const scoped =
  <F extends Fn>(fn: F, index = 0) =>
  (...args: Parameters<F>): ReturnType<F> =>
    inCompany(args[index] as string, () => fn(...args)) as ReturnType<F>;

export const receiveStockAt = scoped(stock.receiveStockAt);
export const pickStockAt = scoped(stock.pickStockAt);
export const exitStockAt = scoped(stock.exitStockAt);
export const moveStockAt = scoped(stock.moveStockAt);
export const requireOwnedBin = scoped(stock.requireOwnedBin, 1);
export const requireOwnedItem = scoped(stock.requireOwnedItem, 1);

export const createFieldDefinition = scoped(customFields.createFieldDefinition);
export const updateFieldDefinition = scoped(customFields.updateFieldDefinition, 1);
export const deleteFieldDefinition = scoped(customFields.deleteFieldDefinition, 1);
export const getFieldDefinitions = scoped(customFields.getFieldDefinitions);
export const setItemValues = scoped(customFields.setItemValues, 1);
// Takes item ids only; tests read it back to assert, so the owner view.
export const getValuesForItems = (itemIds: string[]) => asOwner(() => customFields.getValuesForItems(itemIds));

export const getInventoryRules = scoped(inventory.getInventoryRules);
export const getItemStockStatuses = scoped(inventory.getItemStockStatuses);

export const getCapabilitiesFor = scoped(capabilities.getCapabilitiesFor);
// Session-based, like the app: the signed-in test user's company.
export const requireCapability = (...args: Parameters<typeof capabilities.requireCapability>) =>
  inOrg(() => capabilities.requireCapability(...args));

export const assertCanAddBins = scoped(planLimits.assertCanAddBins);
export const assertCanAddSeats = scoped(planLimits.assertCanAddSeats);
export const assertCanAddFacilities = scoped(planLimits.assertCanAddFacilities);

export const createContract = scoped(contracts.createContract);

export const ensureLevels = async (facilityId: string) => inCompany(await companyOfFacility(facilityId), () => levels.ensureLevels(facilityId));
export const renameLevel = async (facilityId: string, levelId: string, name: string | null) =>
  inCompany(await companyOfFacility(facilityId), () => levels.renameLevel(facilityId, levelId, name));
