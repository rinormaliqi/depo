"use server";

import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { attempt } from "@/lib/action-result";
import { db } from "@/db";
import { contactMessages } from "@/db/schema";
import { recordAdminAction } from "@/lib/admin-audit";
import { requirePlatformAdmin } from "@/lib/platform-admin";

export async function listContactMessages() {
  await requirePlatformAdmin();
  return db.select().from(contactMessages).orderBy(desc(contactMessages.createdAt)).limit(200);
}

async function markContactMessageHandledImpl(id: string) {
  await requirePlatformAdmin();
  await db.update(contactMessages).set({ handledAt: new Date() }).where(eq(contactMessages.id, id));
  await recordAdminAction({ action: "support.message.handled", targetType: "contactMessage", targetId: id });
  revalidatePath("/internal");
}

export async function markContactMessageHandled(id: string) {
  return attempt(() => markContactMessageHandledImpl(id), "markContactMessageHandled");
}
