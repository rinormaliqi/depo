import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getMyFacility } from "@/app/builder/actions";
import { auth } from "@/auth";
import { AppHeader } from "@/components/app-header";
import { BlockedPage } from "@/components/blocked-page";
import { getCapabilities } from "@/lib/capabilities";
import { PasteImport } from "@/components/paste-import";
import { getFieldDefinitions } from "@/lib/custom-fields";
import { IMPORT_COLUMNS } from "@/lib/import-items";
import { requireOrgId } from "@/lib/session";
import { commitItemsImport, previewItemsImport } from "./actions";

export default async function ItemsImportPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const caps = await getCapabilities();
  if (!caps?.can.manageItems) return <BlockedPage capability="manageItems" reason={caps?.reason.manageItems} />;

  const organizationId = await requireOrgId();
  const [facility, t, fieldDefs] = await Promise.all([getMyFacility(), getTranslations(), getFieldDefinitions(organizationId)]);
  const columns = [...IMPORT_COLUMNS, ...fieldDefs.map((f) => f.id)];
  const columnLabels = Object.fromEntries(fieldDefs.map((f) => [f.id, f.label]));

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
          <PasteImport
            ns="items.import"
            columns={columns}
            columnLabels={columnLabels}
            templateHref="/items/import/template"
            backHref="/items"
            preview={previewItemsImport}
            commit={commitItemsImport}
          />
        </div>
      </div>
    </div>
  );
}
