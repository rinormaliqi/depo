import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getMyFacility } from "@/app/builder/actions";
import { getMyItems } from "@/app/items/actions";
import { auth } from "@/auth";
import { AppHeader } from "@/components/app-header";
import { getRecentMovements } from "./actions";
import { ScanForm } from "./scan-form";

export default async function ScannerPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const t = await getTranslations();

  const facility = await getMyFacility();
  if (!facility) {
    return (
      <main style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
        <p className="text-muted">{t("common.noFacility")}</p>
      </main>
    );
  }

  const [items, recent] = await Promise.all([getMyItems(), getRecentMovements()]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", minHeight: 0, overflow: "hidden" }}>
      <AppHeader
        facilityName={facility.name}
        floorText={t("common.floorText", { width: facility.widthM.toFixed(1), height: facility.heightM.toFixed(1) })}
        userEmail={session.user.email ?? ""}
      />
      <div className="scan-page" style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <div className="scan-layout" style={{ maxWidth: 880, margin: "0 auto" }}>
          {items.length === 0 ? (
            <p className="text-muted">
              {t("scanner.noItemsYet")}{" "}
              <Link href="/items" className="underline">
                {t("scanner.addOne")}
              </Link>{" "}
              {t("scanner.first")}
            </p>
          ) : (
            <ScanForm items={items} />
          )}

          <div className="scan-recent">
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 13, letterSpacing: ".16em", textTransform: "uppercase", marginBottom: 11 }}>
              {t("scanner.recentMovements")}
            </div>
            <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("metrics.when")}</th><th>{t("metrics.move")}</th><th>{t("metrics.item")}</th>
                  <th style={{ textAlign: "right" }}>{t("metrics.qty")}</th><th>{t("metrics.to")}</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((m) => (
                  <tr key={m.id}>
                    <td style={{ fontVariantNumeric: "tabular-nums", fontSize: 12, whiteSpace: "nowrap" }}>{m.when}</td>
                    <td style={{ fontSize: 11 }}>{t(`common.reason.${m.reason}` as "common.reason.receive")}</td>
                    <td style={{ fontSize: 12 }}>{m.itemName}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 12 }}>{m.quantity}</td>
                    <td style={{ fontSize: 12, fontVariantNumeric: "tabular-nums", color: "var(--color-accent-700)" }}>{m.to}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            {recent.length === 0 && <p className="text-muted" style={{ fontSize: 13, marginTop: 10 }}>{t("scanner.noMovements")}</p>}
            <div style={{ marginTop: 14, fontSize: 12, lineHeight: 1.55, color: "color-mix(in srgb, var(--color-text) 60%, transparent)", maxWidth: "44ch" }}>
              {t("scanner.footerNote")}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
