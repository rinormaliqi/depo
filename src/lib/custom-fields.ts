import { and, asc, eq, inArray } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import { customFieldTypes, itemCustomFieldDefinitions, itemCustomFieldValues, type CustomFieldType } from "@/db/schema";
import { UserError } from "@/lib/user-error";
import { MAX_FIELD_CHARS } from "@/lib/import-table";

export type FieldDefinition = typeof itemCustomFieldDefinitions.$inferSelect;

const MAX_OPTIONS = 50;

// Turns a label into a stable key: lowercase, diacritics stripped, anything
// that isn't a-z0-9 collapsed to underscores. Values key off this, not the
// label, so renaming a field never orphans what's already stored.
function slugify(label: string): string {
  const base = label
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return base || "field";
}

export async function getFieldDefinitions(organizationId: string): Promise<FieldDefinition[]> {
  return db
    .select()
    .from(itemCustomFieldDefinitions)
    .where(eq(itemCustomFieldDefinitions.organizationId, organizationId))
    .orderBy(asc(itemCustomFieldDefinitions.sortOrder), asc(itemCustomFieldDefinitions.createdAt));
}

function validateOptions(t: Awaited<ReturnType<typeof getTranslations>>, raw: string[] | undefined) {
  const options = (raw ?? []).map((o) => o.trim()).filter(Boolean);
  if (options.length === 0) throw new UserError(t("errorOptionsRequired"));
  if (options.length > MAX_OPTIONS) throw new UserError(t("errorTooManyOptions", { max: MAX_OPTIONS }));
  if (options.some((o) => o.length > MAX_FIELD_CHARS)) throw new UserError(t("errorTooLong", { max: MAX_FIELD_CHARS }));
  // Options are what a select value is checked against — duplicates would
  // make one choice silently shadow another in the dropdown.
  if (new Set(options).size !== options.length) throw new UserError(t("errorDuplicateOption"));
  return options;
}

export async function createFieldDefinition(
  organizationId: string,
  input: { label: string; type: CustomFieldType; options?: string[]; required: boolean },
) {
  const t = await getTranslations("customFields");
  const label = input.label.trim();
  if (!label) throw new UserError(t("errorLabelRequired"));
  if (label.length > MAX_FIELD_CHARS) throw new UserError(t("errorTooLong", { max: MAX_FIELD_CHARS }));
  if (!(customFieldTypes as readonly string[]).includes(input.type)) throw new UserError(t("errorInvalidType"));

  const options = input.type === "select" ? validateOptions(t, input.options) : null;

  const existing = await getFieldDefinitions(organizationId);
  const usedKeys = new Set(existing.map((f) => f.key));
  let key = slugify(label);
  if (usedKeys.has(key)) {
    let n = 2;
    while (usedKeys.has(`${key}_${n}`)) n += 1;
    key = `${key}_${n}`;
  }
  const sortOrder = existing.reduce((max, f) => Math.max(max, f.sortOrder), -1) + 1;

  const [row] = await db
    .insert(itemCustomFieldDefinitions)
    .values({ organizationId, key, label, type: input.type, options, required: input.required, sortOrder })
    .returning();
  return row;
}

async function requireOwnedField(id: string, organizationId: string) {
  const t = await getTranslations("customFields");
  const [row] = await db
    .select()
    .from(itemCustomFieldDefinitions)
    .where(and(eq(itemCustomFieldDefinitions.id, id), eq(itemCustomFieldDefinitions.organizationId, organizationId)));
  if (!row) throw new UserError(t("errorNotFound"));
  return row;
}

// Type and key are fixed at creation: changing a field from "text" to
// "number" would leave every value already stored unparseable, and this
// keeps that whole migration question out of scope rather than guessing at
// a coercion nobody asked for.
export async function updateFieldDefinition(
  id: string,
  organizationId: string,
  input: { label: string; options?: string[]; required: boolean },
) {
  const t = await getTranslations("customFields");
  const existing = await requireOwnedField(id, organizationId);

  const label = input.label.trim();
  if (!label) throw new UserError(t("errorLabelRequired"));
  if (label.length > MAX_FIELD_CHARS) throw new UserError(t("errorTooLong", { max: MAX_FIELD_CHARS }));

  const options = existing.type === "select" ? validateOptions(t, input.options) : null;

  await db
    .update(itemCustomFieldDefinitions)
    .set({ label, options, required: input.required })
    .where(eq(itemCustomFieldDefinitions.id, id));
}

// Deleting a field drops every value ever recorded for it (cascade on
// item_custom_field_values) — the UI confirms this like any other
// destructive action, it isn't softened here.
export async function deleteFieldDefinition(id: string, organizationId: string) {
  await requireOwnedField(id, organizationId);
  await db.delete(itemCustomFieldDefinitions).where(eq(itemCustomFieldDefinitions.id, id));
}

export async function getValuesForItems(itemIds: string[]): Promise<Map<string, Record<string, string>>> {
  const byItem = new Map<string, Record<string, string>>();
  if (itemIds.length === 0) return byItem;

  const rows = await db
    .select({ itemId: itemCustomFieldValues.itemId, fieldDefinitionId: itemCustomFieldValues.fieldDefinitionId, value: itemCustomFieldValues.value })
    .from(itemCustomFieldValues)
    .where(inArray(itemCustomFieldValues.itemId, itemIds));

  for (const row of rows) {
    const entry = byItem.get(row.itemId) ?? {};
    entry[row.fieldDefinitionId] = row.value;
    byItem.set(row.itemId, entry);
  }
  return byItem;
}

// `values` is keyed by fieldDefinitionId, one entry per field this org has
// defined (missing/blank means "clear this field", not "leave it alone") —
// the caller always sends the full set, the same way a form submits every
// field it renders.
export async function setItemValues(itemId: string, organizationId: string, values: Record<string, string>) {
  const t = await getTranslations("customFields");
  const definitions = await getFieldDefinitions(organizationId);

  const toUpsert: { fieldDefinitionId: string; value: string }[] = [];
  const toClear: string[] = [];

  for (const def of definitions) {
    const trimmed = (values[def.id] ?? "").trim();
    if (!trimmed) {
      if (def.required) throw new UserError(t("errorFieldRequired", { label: def.label }));
      toClear.push(def.id);
      continue;
    }
    if (trimmed.length > MAX_FIELD_CHARS) throw new UserError(t("errorValueTooLong", { label: def.label, max: MAX_FIELD_CHARS }));
    if (def.type === "number" && !Number.isFinite(Number(trimmed))) throw new UserError(t("errorInvalidNumber", { label: def.label }));
    if (def.type === "date" && Number.isNaN(Date.parse(trimmed))) throw new UserError(t("errorInvalidDate", { label: def.label }));
    if (def.type === "boolean" && trimmed !== "true" && trimmed !== "false") throw new UserError(t("errorInvalidOption", { label: def.label }));
    if (def.type === "select" && !(def.options ?? []).includes(trimmed)) throw new UserError(t("errorInvalidOption", { label: def.label }));
    toUpsert.push({ fieldDefinitionId: def.id, value: trimmed });
  }

  await db.transaction(async (tx) => {
    if (toClear.length > 0) {
      await tx
        .delete(itemCustomFieldValues)
        .where(and(eq(itemCustomFieldValues.itemId, itemId), inArray(itemCustomFieldValues.fieldDefinitionId, toClear)));
    }
    for (const { fieldDefinitionId, value } of toUpsert) {
      await tx
        .insert(itemCustomFieldValues)
        .values({ itemId, fieldDefinitionId, value, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: [itemCustomFieldValues.itemId, itemCustomFieldValues.fieldDefinitionId],
          set: { value, updatedAt: new Date() },
        });
    }
  });
}
