"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import { items } from "@/db/schema";
import { requirePermission } from "@/lib/permissions";
import { requireOrgId } from "@/lib/session";

export type ItemRow = typeof items.$inferSelect;

export async function getMyItems() {
  const organizationId = await requireOrgId();
  return db.select().from(items).where(eq(items.organizationId, organizationId)).orderBy(items.name);
}

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

  await db.insert(items).values({
    organizationId,
    name,
    unitOfMeasure,
    sku: sku || null,
    category: category || null,
  });

  revalidatePath("/items");
  // `at` makes each success distinct, so the form's toast fires per submit.
  return { created: { name, at: Date.now() } };
}
