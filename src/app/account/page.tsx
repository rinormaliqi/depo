import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { AppHeader } from "@/components/app-header";
import { getMyFacility } from "@/app/builder/actions";
import { db } from "@/db";
import { users } from "@/db/schema";
import { listMyOrganizations } from "@/lib/organizations";
import { NOINDEX } from "@/lib/seo";
import { AccountClient } from "./account-client";

export const metadata = NOINDEX;

// The person's own settings — every role, from the ⋯ menu. Organization
// matters only for the delete rules, which the action explains itself.
export default async function AccountPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const [user] = await db.select().from(users).where(eq(users.id, session.user.id));
  if (!user) redirect("/login");
  const [facility, orgs, t] = await Promise.all([getMyFacility(), listMyOrganizations(user.id), getTranslations()]);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      {facility && (
        <AppHeader
          facilityId={facility.id}
          facilityName={facility.name}
          floorText={t("common.floorText", { width: facility.widthM.toFixed(1), height: facility.heightM.toFixed(1) })}
          userEmail={user.email}
        />
      )}
      <main className="account-page" style={{ flex: 1 }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 24, margin: "0 0 4px" }}>{t("account.title")}</h1>
          <p className="text-muted" style={{ fontSize: 13, marginTop: 0 }}>{t("account.intro")}</p>
          <AccountClient
            name={user.name}
            email={user.email}
            hasPassword={!!user.passwordHash}
            organizations={orgs.map((o) => ({ name: o.name, role: o.role }))}
          />
        </div>
      </main>
    </div>
  );
}
