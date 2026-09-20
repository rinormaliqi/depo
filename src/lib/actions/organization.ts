"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { listMyOrganizations, rememberOrganization } from "@/lib/organizations";

export async function getMyOrganizations() {
  const session = await auth();
  if (!session?.user?.id) return [];
  return listMyOrganizations(session.user.id);
}

// Only an organization the user actually belongs to; a forged id is ignored.
export async function switchOrganization(organizationId: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  const mine = await listMyOrganizations(session.user.id);
  if (!mine.some((o) => o.id === organizationId)) return;
  await rememberOrganization(organizationId);
  revalidatePath("/", "layout");
}
