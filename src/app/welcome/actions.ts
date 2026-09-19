"use server";

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { createOrganizationForFounder, hasMembership } from "@/lib/onboarding";

type FormState = { error?: string } | undefined;

// The one thing the password signup form asks that Google can't answer:
// what the company is called. Idempotent — a double submit or a stale tab
// finds the membership already there and just moves on.
export async function createCompany(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const t = await getTranslations("welcome");

  if (await hasMembership(session.user.id)) redirect("/start");

  const companyName = formData.get("companyName")?.toString().trim();
  if (!companyName) return { error: t("errorRequired") };

  try {
    await createOrganizationForFounder({ userId: session.user.id, companyName, emailVerified: true });
  } catch {
    return { error: t("errorGeneric") };
  }
  redirect("/start");
}
