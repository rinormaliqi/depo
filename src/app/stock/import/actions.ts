"use server";

import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getMyFacility } from "@/app/builder/actions";
import { db } from "@/db";
import { items, locations, movements, stock } from "@/db/schema";
import { attempt } from "@/lib/action-result";
import { parseStockText, type StockError } from "@/lib/import-stock";
import { MAX_IMPORT_CHARS } from "@/lib/import-table";
import { requirePermission } from "@/lib/permissions";
import { UserError } from "@/lib/user-error";

// The inventory count, in bulk: each row is a `receive` into a bin of the
// facility the user is in — exactly what receiveStockAt() does one scan
// at a time, with the same preview-then-commit shape as the items import
// (src/app/items/import/actions.ts): the preview resolves every row
// against the catalogue and the floor and writes nothing; the commit
// re-resolves the same text and refuses if any line is wrong.

export type StockImportPreview = {
  counts: { rows: number; bins: number; units: number };
  errors: StockError[];
  sample: string[][];
  hasHeader: boolean;
};

const SAMPLE_ROWS = 5;
const CHUNK = 500;

type Resolved = { line: number; itemId: string; locationId: string; quantity: number; label: string[] };

async function resolve(text: string, organizationId: string, facilityId: string) {
  if (text.length > MAX_IMPORT_CHARS) {
    const t = await getTranslations("stock.import");
    throw new UserError(t("errorTooLarge"));
  }
  const parsed = parseStockText(text);
  const errors = [...parsed.errors];

  // Items by SKU first, then by exact name — a catalogue without SKUs
  // can still be counted; a name two items share is reported rather
  // than guessed.
  const keys = [...new Set(parsed.rows.map((r) => r.item))];
  const catalogue = keys.length
    ? await db
        .select({ id: items.id, sku: items.sku, name: items.name })
        .from(items)
        .where(and(eq(items.organizationId, organizationId), sql`(${items.sku} in ${keys} or ${items.name} in ${keys})`))
    : [];
  const bySku = new Map<string, string>();
  const byName = new Map<string, string[]>();
  for (const row of catalogue) {
    if (row.sku !== null) bySku.set(row.sku, row.id);
    byName.set(row.name, [...(byName.get(row.name) ?? []), row.id]);
  }

  const codes = [...new Set(parsed.rows.map((r) => r.location))];
  const bins = codes.length
    ? await db
        .select({ id: locations.id, code: locations.code })
        .from(locations)
        .where(and(eq(locations.facilityId, facilityId), eq(locations.isBin, true), isNotNull(locations.code), inArray(locations.code, codes)))
    : [];
  const byCode = new Map(bins.map((b) => [b.code as string, b.id]));

  const resolved: Resolved[] = [];
  for (const row of parsed.rows) {
    let itemId = bySku.get(row.item) ?? null;
    if (itemId === null) {
      const named = byName.get(row.item) ?? [];
      if (named.length > 1) {
        errors.push({ line: row.line, code: "itemAmbiguous", value: row.item });
        continue;
      }
      itemId = named[0] ?? null;
    }
    const locationId = byCode.get(row.location) ?? null;
    if (itemId === null) errors.push({ line: row.line, code: "itemUnknown", value: row.item });
    if (locationId === null) errors.push({ line: row.line, code: "locationUnknown", value: row.location });
    if (itemId !== null && locationId !== null) {
      resolved.push({ line: row.line, itemId, locationId, quantity: row.quantity, label: [row.item, row.location, String(row.quantity)] });
    }
  }
  errors.sort((a, b) => a.line - b.line);
  return { parsed, resolved, errors };
}

async function requireImportContext() {
  const { organizationId, userId } = await requirePermission("manageItems");
  const facility = await getMyFacility();
  if (!facility) {
    const t = await getTranslations("common");
    throw new UserError(t("noFacility"));
  }
  return { organizationId, userId, facility };
}

async function previewStockImportImpl(text: string): Promise<StockImportPreview> {
  const { organizationId, facility } = await requireImportContext();
  const { parsed, resolved, errors } = await resolve(text, organizationId, facility.id);
  return {
    counts: {
      rows: resolved.length,
      bins: new Set(resolved.map((r) => r.locationId)).size,
      units: resolved.reduce((sum, r) => sum + r.quantity, 0),
    },
    errors,
    sample: resolved.slice(0, SAMPLE_ROWS).map((r) => r.label),
    hasHeader: parsed.hasHeader,
  };
}

export async function previewStockImport(text: string) {
  return attempt(() => previewStockImportImpl(text), "previewStockImport");
}

async function commitStockImportImpl(text: string) {
  const { organizationId, userId, facility } = await requireImportContext();
  const { resolved, errors } = await resolve(text, organizationId, facility.id);
  if (errors.length > 0) {
    const t = await getTranslations("stock.import");
    throw new UserError(t("errorFixFirst", { n: errors.length }));
  }

  // One movement per line (the count sheet is the audit trail), but the
  // stock upsert is summed per item × bin first — one INSERT can't hit
  // the same conflict row twice.
  const totals = new Map<string, { itemId: string; locationId: string; quantity: number }>();
  for (const r of resolved) {
    const key = `${r.itemId}:${r.locationId}`;
    const cur = totals.get(key);
    if (cur) cur.quantity += r.quantity;
    else totals.set(key, { itemId: r.itemId, locationId: r.locationId, quantity: r.quantity });
  }
  const upserts = [...totals.values()];

  await db.transaction(async (tx) => {
    for (let i = 0; i < resolved.length; i += CHUNK) {
      await tx.insert(movements).values(
        resolved.slice(i, i + CHUNK).map((r) => ({
          organizationId,
          itemId: r.itemId,
          fromLocationId: null,
          toLocationId: r.locationId,
          quantity: r.quantity,
          reason: "receive" as const,
          performedBy: userId,
        })),
      );
    }
    for (let i = 0; i < upserts.length; i += CHUNK) {
      await tx
        .insert(stock)
        .values(upserts.slice(i, i + CHUNK))
        .onConflictDoUpdate({
          target: [stock.itemId, stock.locationId],
          set: { quantity: sql`${stock.quantity} + excluded.quantity`, updatedAt: new Date() },
        });
    }
  });

  revalidatePath("/stock");
  revalidatePath("/builder");
  revalidatePath("/metrics");
  revalidatePath("/scanner");
  return { rows: resolved.length, bins: upserts.length ? new Set(upserts.map((u) => u.locationId)).size : 0 };
}

export async function commitStockImport(text: string) {
  return attempt(() => commitStockImportImpl(text), "commitStockImport");
}
