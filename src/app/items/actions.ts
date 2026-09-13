"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import { items } from "@/db/schema";
import { requireOrgId } from "@/lib/session";

export type ItemRow = typeof items.$inferSelect;

export async function getMyItems() {
  const organizationId = await requireOrgId();
  return db.select().from(items).where(eq(items.organizationId, organizationId)).orderBy(items.name);
}

type FormState = { error?: string } | undefined;

export async function createItem(_prevState: FormState, formData: FormData): Promise<FormState> {
  const organizationId = await requireOrgId();

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
}
