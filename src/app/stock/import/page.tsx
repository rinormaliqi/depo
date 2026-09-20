import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getMyFacility } from "@/app/builder/actions";
import { auth } from "@/auth";
import { AppHeader } from "@/components/app-header";
import { NotForRole } from "@/components/not-for-role";
import { PasteImport } from "@/components/paste-import";
import { getCapabilities } from "@/lib/capabilities";
import { STOCK_COLUMNS } from "@/lib/import-stock";
import { commitStockImport, previewStockImport } from "./actions";

export default async function StockImportPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const caps = await getCapabilities();
  if (!caps?.can.manageItems) return <NotForRole capability="manageItems" />;

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
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 20, marginBottom: 6 }}>{t("stock.import.title", { facility: facility.name })}</div>
          <p className="text-muted" style={{ fontSize: 13, marginTop: 0, marginBottom: 16 }}>{t("stock.import.intro")}</p>
          <PasteImport
            ns="stock.import"
            columns={STOCK_COLUMNS}
            templateHref="/stock/import/template"
            backHref="/stock"
            preview={previewStockImport}
            commit={commitStockImport}
          />
        </div>
      </div>
    </div>
  );
}
