"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { items } from "@/db/schema";
import { attempt } from "@/lib/action-result";
import {
  createFieldDefinition,
  deleteFieldDefinition,
  getFieldDefinitions,
  getValuesForItems,
  setItemValues,
  updateFieldDefinition,
} from "@/lib/custom-fields";
import type { CustomFieldType } from "@/db/schema";
import { requirePermission } from "@/lib/permissions";
import { requireOrgId } from "@/lib/session";
import { requireOwnedItem } from "@/lib/stock";

export async function getMyFieldDefinitions() {
  const organizationId = await requireOrgId();
  return getFieldDefinitions(organizationId);
}

// Keyed by itemId, then by fieldDefinitionId — a plain object rather than
// the lib's Map so it survives the server action's JSON boundary as-is.
// getValuesForItems trusts the itemIds it's given, so this is where a
// cross-org id gets filtered out before it ever reaches that query — a
// caller could otherwise hand it another company's item id and read back
// its custom field values.
export async function getMyItemsCustomValues(itemIds: string[]) {
  const organizationId = await requireOrgId();
  if (itemIds.length === 0) return {};
  const owned = await db
    .select({ id: items.id })
    .from(items)
    .where(and(eq(items.organizationId, organizationId), inArray(items.id, itemIds)));
  const byItem = await getValuesForItems(owned.map((i) => i.id));
  return Object.fromEntries(byItem);
}

type FieldInput = { label: string; type: CustomFieldType; options?: string[]; required: boolean };

async function createFieldImpl(input: FieldInput) {
  const { organizationId } = await requirePermission("manageItems");
  const row = await createFieldDefinition(organizationId, input);
  revalidatePath("/items");
  return row;
}
export async function createField(input: FieldInput) {
  return attempt(() => createFieldImpl(input), "createCustomField");
}

async function updateFieldImpl(id: string, input: Omit<FieldInput, "type">) {
  const { organizationId } = await requirePermission("manageItems");
  await updateFieldDefinition(id, organizationId, input);
  revalidatePath("/items");
}
export async function updateField(id: string, input: Omit<FieldInput, "type">) {
  return attempt(() => updateFieldImpl(id, input), "updateCustomField");
}

async function deleteFieldImpl(id: string) {
  const { organizationId } = await requirePermission("manageItems");
  await deleteFieldDefinition(id, organizationId);
  revalidatePath("/items");
}
export async function deleteField(id: string) {
  return attempt(() => deleteFieldImpl(id), "deleteCustomField");
}

async function setValuesImpl(itemId: string, values: Record<string, string>) {
  const { organizationId } = await requirePermission("manageItems");
  await requireOwnedItem(itemId, organizationId);
  await setItemValues(itemId, organizationId, values);
  revalidatePath("/items");
}
export async function setItemCustomValues(itemId: string, values: Record<string, string>) {
  return attempt(() => setValuesImpl(itemId, values), "setItemCustomValues");
}
