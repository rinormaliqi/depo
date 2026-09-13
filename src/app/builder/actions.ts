"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { facilities, locations } from "@/db/schema";

export type LocationRow = typeof locations.$inferSelect;

// Placeholder until auth/org-scoping exists: grabs the single demo facility.
export async function getDemoFacility() {
  const [facility] = await db.select().from(facilities).limit(1);
  return facility ?? null;
}

export async function getChildren(facilityId: string, parentId: string | null) {
  return db
    .select()
    .from(locations)
    .where(
      and(
        eq(locations.facilityId, facilityId),
        parentId ? eq(locations.parentId, parentId) : isNull(locations.parentId),
      ),
    )
    .orderBy(locations.createdAt);
}

export async function createLocation(
  facilityId: string,
  parentId: string | null,
  name: string,
  isBin: boolean,
) {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Name is required");
  }

  if (parentId) {
    const [parent] = await db.select().from(locations).where(eq(locations.id, parentId));
    if (!parent) {
      throw new Error("Parent location not found");
    }
    if (parent.isBin) {
      throw new Error("Cannot add a location inside a bin");
    }
  }

  const [created] = await db
    .insert(locations)
    .values({ facilityId, parentId, name: trimmed, isBin })
    .returning();

  revalidatePath("/builder");
  return created;
}
