import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getMyFacility } from "@/app/builder/actions";
import { auth } from "@/auth";
import { AppHeader } from "@/components/app-header";
import { BlockedPage } from "@/components/blocked-page";
import { PasteImport } from "@/components/paste-import";
import { getCapabilities } from "@/lib/capabilities";
import { LOCATION_COLUMNS } from "@/lib/import-locations";
import { commitLocationsImport, previewLocationsImport } from "../actions";

// A depot that already has a location list: paste it, check it, and the
// floor is drawn — zones, racks with their bays and levels — instead of
// placed one by one. Same PasteImport shell as the items/stock imports.
export default async function LocationsImportPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const caps = await getCapabilities();
  if (!caps?.can.editLayout) return <BlockedPage capability="editLayout" reason={caps?.reason.editLayout} />;

  const [facility, t] = await Promise.all([getMyFacility(), getTranslations()]);
  if (!facility) {
    return (
      <main style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
        <p className="text-muted">{t("common.noFacility")}</p>
      </main>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", minHeight: 0, overflow: "hidden" }}>
      <AppHeader
        facilityId={facility.id}
        facilityName={facility.name}
        floorText={t("common.floorText", { width: facility.widthM.toFixed(1), height: facility.heightM.toFixed(1) })}
        userEmail={session.user.email ?? ""}
      />
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 26 }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 20, marginBottom: 6 }}>{t("builder.import.title", { facility: facility.name })}</div>
          <p className="text-muted" style={{ fontSize: 13, marginTop: 0, marginBottom: 16 }}>{t("builder.import.intro")}</p>
          <PasteImport
            ns="builder.import"
            columns={LOCATION_COLUMNS}
            templateHref="/builder/import/template"
            backHref="/builder"
            preview={previewLocationsImport.bind(null, facility.id)}
            commit={commitLocationsImport.bind(null, facility.id)}
          />
        </div>
      </div>
    </div>
  );
}
