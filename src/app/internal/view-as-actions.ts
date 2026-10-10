"use server";

import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { attempt } from "@/lib/action-result";
import { buildBlueprintData } from "@/lib/blueprint-data";
import { db } from "@/db";
import { items, stock } from "@/db/schema";
import { listFacilities } from "@/lib/facilities";
import * as viewAs from "@/lib/view-as";

async function startViewAsImpl(organizationId: string) {
  await viewAs.startViewAs(organizationId);
  redirect("/internal/view-as");
}

export async function startViewAs(organizationId: string) {
  return attempt(() => startViewAsImpl(organizationId), "startViewAs");
}

async function endViewAsImpl() {
  await viewAs.endViewAs();
  redirect("/internal");
}

export async function endViewAs() {
  return attempt(() => endViewAsImpl(), "endViewAs");
}

async function getViewAsDataImpl() {
  const active = await viewAs.requireActiveViewAs();
  const facilities = await listFacilities(active.organizationId);
  const facility = facilities[0] ?? null;

  const blueprint = facility ? await buildBlueprintData(facility.id) : null;

  const itemRows = await db
    .select({
      id: items.id,
      name: items.name,
      sku: items.sku,
      category: items.category,
      unitOfMeasure: items.unitOfMeasure,
      minStockLevel: items.minStockLevel,
      inStock: sql<number>`coalesce(sum(${stock.quantity}), 0)::int`,
    })
    .from(items)
    .leftJoin(stock, eq(stock.itemId, items.id))
    .where(eq(items.organizationId, active.organizationId))
    .groupBy(items.id)
    .orderBy(items.name);

  return {
    organizationName: active.organizationName,
    expiresAt: active.expiresAt,
    facility,
    blueprint,
    items: itemRows,
  };
}

export async function getViewAsData() {
  return attempt(() => getViewAsDataImpl(), "getViewAsData");
}
