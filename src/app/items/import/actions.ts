"use server";

import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import { items, itemCustomFieldValues } from "@/db/schema";
import { attempt } from "@/lib/action-result";
import { getFieldDefinitions, type FieldDefinition } from "@/lib/custom-fields";
import { MAX_IMPORT_CHARS, parseItemsText, type ImportError, type ImportRow } from "@/lib/import-items";
import { requirePermission } from "@/lib/permissions";
import { UserError } from "@/lib/user-error";

// Two steps on purpose: the preview is the only confirmation there is,
// so nothing may be written until the user has seen "N new, M updated,
// 0 errors" for exactly the text they pasted. The commit re-parses the
// same text server-side rather than trusting rows sent back from the
// browser, and refuses if a single line is wrong — a half-imported
// catalogue is worse than none.

export type ImportPreview = {
  counts: { create: number; update: number };
  errors: ImportError[];
  // The first few rows as they'll be written, so a wrong column mapping
  // is visible before anything happens.
  sample: string[][];
  hasHeader: boolean;
  fieldDefs: { id: string; label: string }[];
};

const SAMPLE_ROWS = 5;

async function analyse(text: string, organizationId: string) {
  if (text.length > MAX_IMPORT_CHARS) {
    const t = await getTranslations("items.import");
    throw new UserError(t("errorTooLarge"));
  }
  const fieldDefs = await getFieldDefinitions(organizationId);
  const parsed = parseItemsText(text, fieldDefs);
  const skus = parsed.rows.map((r) => r.sku).filter((s): s is string => s !== null);
  const existing = skus.length
    ? await db
        .select({ sku: items.sku })
        .from(items)
        .where(and(eq(items.organizationId, organizationId), isNotNull(items.sku), inArray(items.sku, skus)))
    : [];
  const existingSkus = new Set(existing.map((r) => r.sku));
  const updates = parsed.rows.filter((r) => r.sku !== null && existingSkus.has(r.sku));
  return { parsed, fieldDefs, existingSkus, create: parsed.rows.length - updates.length, update: updates.length };
}

async function previewItemsImportImpl(text: string): Promise<ImportPreview> {
  const { organizationId } = await requirePermission("manageItems");
  const { parsed, fieldDefs, create, update } = await analyse(text, organizationId);
  return {
    counts: { create, update },
    errors: parsed.errors,
    sample: parsed.rows
      .slice(0, SAMPLE_ROWS)
      .map((r) => [r.name, r.unit, r.sku ?? "", r.category ?? "", ...fieldDefs.map((f) => r.customValues[f.id] ?? "")]),
    hasHeader: parsed.hasHeader,
    fieldDefs: fieldDefs.map((f) => ({ id: f.id, label: f.label })),
  };
}

export async function previewItemsImport(text: string) {
  return attempt(() => previewItemsImportImpl(text), "previewItemsImport");
}

const CHUNK = 500;

// Applies (or clears) one row's custom field values against the item that
// was just created/updated for it. A field absent from `row.customValues`
// is deleted rather than skipped — an update fully replaces what a row
// says about an item, the same way a blank `category` cell already
// overwrites an existing one; a create has nothing to delete, so this is
// a no-op there.
async function applyRowCustomValues(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  itemId: string,
  row: ImportRow,
  fieldDefs: FieldDefinition[],
) {
  if (fieldDefs.length === 0) return;
  const setIds = Object.keys(row.customValues);
  const clearIds = fieldDefs.map((f) => f.id).filter((id) => !setIds.includes(id));
  if (clearIds.length > 0) {
    await tx
      .delete(itemCustomFieldValues)
      .where(and(eq(itemCustomFieldValues.itemId, itemId), inArray(itemCustomFieldValues.fieldDefinitionId, clearIds)));
  }
  for (const [fieldDefinitionId, value] of Object.entries(row.customValues)) {
    await tx
      .insert(itemCustomFieldValues)
      .values({ itemId, fieldDefinitionId, value, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [itemCustomFieldValues.itemId, itemCustomFieldValues.fieldDefinitionId],
        set: { value, updatedAt: new Date() },
      });
  }
}

async function commitItemsImportImpl(text: string) {
  const { organizationId } = await requirePermission("manageItems");
  const { parsed, fieldDefs, create, update } = await analyse(text, organizationId);
  if (parsed.errors.length > 0) {
    const t = await getTranslations("items.import");
    throw new UserError(t("errorFixFirst", { n: parsed.errors.length }));
  }

  const withSku = parsed.rows.filter((r) => r.sku !== null);
  const withoutSku = parsed.rows.filter((r) => r.sku === null);
  const toValues = (r: ImportRow) => ({ organizationId, name: r.name, unitOfMeasure: r.unit, sku: r.sku, category: r.category });

  await db.transaction(async (tx) => {
    for (let i = 0; i < withSku.length; i += CHUNK) {
      const slice = withSku.slice(i, i + CHUNK);
      const rows = await tx
        .insert(items)
        .values(slice.map(toValues))
        .onConflictDoUpdate({
          target: [items.organizationId, items.sku],
          targetWhere: sql`${items.sku} is not null`,
          set: { name: sql`excluded.name`, unitOfMeasure: sql`excluded.unit_of_measure`, category: sql`excluded.category` },
        })
        .returning({ id: items.id });
      for (let j = 0; j < slice.length; j++) await applyRowCustomValues(tx, rows[j].id, slice[j], fieldDefs);
    }
    for (let i = 0; i < withoutSku.length; i += CHUNK) {
      const slice = withoutSku.slice(i, i + CHUNK);
      const rows = await tx.insert(items).values(slice.map(toValues)).returning({ id: items.id });
      for (let j = 0; j < slice.length; j++) await applyRowCustomValues(tx, rows[j].id, slice[j], fieldDefs);
    }
  });

  revalidatePath("/items");
  return { created: create, updated: update };
}

export async function commitItemsImport(text: string) {
  return attempt(() => commitItemsImportImpl(text), "commitItemsImport");
}
