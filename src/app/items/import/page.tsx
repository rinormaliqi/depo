import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getMyFacility } from "@/app/builder/actions";
import { auth } from "@/auth";
import { AppHeader } from "@/components/app-header";
import { NotForRole } from "@/components/not-for-role";
import { getCapabilities } from "@/lib/capabilities";
import { ImportForm } from "./import-form";

export default async function ItemsImportPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const caps = await getCapabilities();
  if (!caps?.can.manageItems) return <NotForRole capability="manageItems" />;

  const [facility, t] = await Promise.all([getMyFacility(), getTranslations()]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", minHeight: 0, overflow: "hidden" }}>
      {facility && (
        <AppHeader
          facilityId={facility.id}
          facilityName={facility.name}
          floorText={t("common.floorText", { width: facility.widthM.toFixed(1), height: facility.heightM.toFixed(1) })}
          userEmail={session.user.email ?? ""}
        />
      )}
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 26 }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 20, marginBottom: 6 }}>{t("items.import.title")}</div>
          <p className="text-muted" style={{ fontSize: 13, marginTop: 0, marginBottom: 16 }}>{t("items.import.intro")}</p>
          <ImportForm />
        </div>
      </div>
    </div>
  );
}
