"use server";

import { and, eq, gt, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import { items, movements, stock } from "@/db/schema";
import { attempt } from "@/lib/action-result";
import { requirePermission } from "@/lib/permissions";
import { requireOrgId } from "@/lib/session";
import { UserError } from "@/lib/user-error";

export type ItemRow = typeof items.$inferSelect;

export async function getMyItems() {
  const organizationId = await requireOrgId();
  return db.select().from(items).where(eq(items.organizationId, organizationId)).orderBy(items.name);
}

// The catalogue page's list: each item with what's on the floor across
// the company's facilities, so "can I remove this?" is answered before
// the click.
export async function getMyItemsWithStock() {
  const organizationId = await requireOrgId();
  return db
    .select({
      id: items.id,
      name: items.name,
      sku: items.sku,
      category: items.category,
      unitOfMeasure: items.unitOfMeasure,
      inStock: sql<number>`coalesce(sum(${stock.quantity}), 0)::int`,
    })
    .from(items)
    .leftJoin(stock, eq(stock.itemId, items.id))
    .where(eq(items.organizationId, organizationId))
    .groupBy(items.id)
    .orderBy(items.name);
}
export type ItemWithStock = Awaited<ReturnType<typeof getMyItemsWithStock>>[number];

type FormState = { error?: string; created?: { name: string; at: number } } | undefined;

export async function createItem(_prevState: FormState, formData: FormData): Promise<FormState> {
  let organizationId: string;
  try {
    organizationId = (await requirePermission("manageItems")).organizationId;
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  const name = formData.get("name")?.toString().trim();
  const unitOfMeasure = formData.get("unitOfMeasure")?.toString().trim();
  const sku = formData.get("sku")?.toString().trim();
  const category = formData.get("category")?.toString().trim();

  if (!name || !unitOfMeasure) {
    const t = await getTranslations("items");
    return { error: t("errorRequired") };
  }

  try {
    await db.insert(items).values({
      organizationId,
      name,
      unitOfMeasure,
      sku: sku || null,
      category: category || null,
    });
  } catch (e) {
    if (isSkuTaken(e)) {
      const t = await getTranslations("items");
      return { error: t("errorSkuTaken", { sku: sku ?? "" }) };
    }
    throw e;
  }

  revalidatePath("/items");
  // `at` makes each success distinct, so the form's toast fires per submit.
  return { created: { name, at: Date.now() } };
}

// items_org_sku_idx: the same SKU twice in one company. Drizzle wraps
// the driver's error, so the Postgres code sits on `cause`.
function isSkuTaken(e: unknown) {
  return (e as { cause?: { code?: string } })?.cause?.code === "23505";
}

async function requireOwnedItem(itemId: string, organizationId: string) {
  const [item] = await db.select().from(items).where(and(eq(items.id, itemId), eq(items.organizationId, organizationId)));
  if (!item) {
    const t = await getTranslations("items");
    throw new UserError(t("errorNotFound"));
  }
  return item;
}

export type ItemPatch = { name: string; unitOfMeasure: string; sku: string; category: string };

async function updateItemImpl(itemId: string, patch: ItemPatch) {
  const { organizationId } = await requirePermission("manageItems");
  await requireOwnedItem(itemId, organizationId);
  const t = await getTranslations("items");

  const name = patch.name.trim();
  const unitOfMeasure = patch.unitOfMeasure.trim();
  const sku = patch.sku.trim();
  const category = patch.category.trim();
  if (!name || !unitOfMeasure) throw new UserError(t("errorRequired"));

  try {
    await db
      .update(items)
      .set({ name, unitOfMeasure, sku: sku || null, category: category || null })
      .where(eq(items.id, itemId));
  } catch (e) {
    if (isSkuTaken(e)) throw new UserError(t("errorSkuTaken", { sku }));
    throw e;
  }
  revalidatePath("/items");
  return { name };
}

export async function updateItem(itemId: string, patch: ItemPatch) {
  return attempt(() => updateItemImpl(itemId, patch), "updateItem");
}

// An item is only removable while nothing ever happened to it: stock on
// the floor is refused outright, and a movement — even a fully picked
// one — means the item is part of the depot's history, which stays
// complete (the same rule that keeps `performed_by` on a deleted
// account). Emptied stock rows (quantity 0) go with it.
async function deleteItemImpl(itemId: string) {
  const { organizationId } = await requirePermission("manageItems");
  const item = await requireOwnedItem(itemId, organizationId);
  const t = await getTranslations("items");

  const [stocked] = await db
    .select({ id: stock.id })
    .from(stock)
    .where(and(eq(stock.itemId, itemId), gt(stock.quantity, 0)))
    .limit(1);
  if (stocked) throw new UserError(t("errorHasStock", { name: item.name }));

  const [moved] = await db.select({ id: movements.id }).from(movements).where(eq(movements.itemId, itemId)).limit(1);
  if (moved) throw new UserError(t("errorHasHistory", { name: item.name }));

  await db.transaction(async (tx) => {
    await tx.delete(stock).where(eq(stock.itemId, itemId));
    await tx.delete(items).where(eq(items.id, itemId));
  });
  revalidatePath("/items");
  return { name: item.name };
}

export async function deleteItem(itemId: string) {
  return attempt(() => deleteItemImpl(itemId), "deleteItem");
}
