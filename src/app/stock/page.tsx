import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getMyFacility } from "@/app/builder/actions";
import { auth } from "@/auth";
import { AppHeader } from "@/components/app-header";
import { getCapabilities } from "@/lib/capabilities";
import { getZoneUtilization, searchStock } from "./actions";
import { StockSearch } from "./stock-search";

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
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

  const { q } = await searchParams;
  const [initialResults, zones, caps] = await Promise.all([
    q ? searchStock(q) : Promise.resolve([]),
    getZoneUtilization(),
    getCapabilities(),
  ]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", minHeight: 0, overflow: "hidden" }}>
      <AppHeader
        facilityId={facility.id}
          facilityName={facility.name}
        floorText={t("common.floorText", { width: facility.widthM.toFixed(1), height: facility.heightM.toFixed(1) })}
        userEmail={session.user.email ?? ""}
      />
      <div className="stock-layout" style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <div className="stock-search-pane" style={{ background: "#fff", overflow: "auto" }}>
          <StockSearch initialQuery={q ?? ""} initialResults={initialResults} />
        </div>

        <div className="stock-zones-pane" style={{ overflow: "auto" }}>
          <div
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: 13,
              letterSpacing: ".16em",
              textTransform: "uppercase",
              marginBottom: 11,
            }}
          >
            {t("stock.zoneUtilisation")}
          </div>
          {caps?.can.manageItems && (
            <Link href="/stock/import" className="btn btn-ghost" style={{ marginBottom: 12, alignSelf: "flex-start" }}>
              {t("stock.importLink")}
            </Link>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 0, maxWidth: 560 }}>
            {zones.map((z) => (
              <div
                key={z.id}
                style={{
                  padding: "11px 0",
                  borderBottom: "1px solid color-mix(in srgb, var(--color-text) 8%, transparent)",
                }}
              >
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                  <span style={{ fontFamily: "var(--font-heading)", fontSize: 16, letterSpacing: ".05em" }}>
                    {z.code} · {z.name}
                  </span>
                  <span style={{ fontFamily: "var(--font-heading)", fontSize: 19, fontVariantNumeric: "tabular-nums" }}>
                    {z.occPct}%
                  </span>
                </div>
                <div style={{ marginTop: 7, height: 8, background: "var(--color-neutral-200)" }}>
                  <div style={{ width: `${z.occPct}%`, height: "100%", background: "var(--color-accent)" }} />
                </div>
                <div
                  style={{
                    marginTop: 5,
                    fontSize: 11,
                    fontVariantNumeric: "tabular-nums",
                    color: "color-mix(in srgb, var(--color-text) 50%, transparent)",
                  }}
                >
                  {t("stock.occupiedOfTotal", { occupied: z.occupied, total: z.totalBins, area: z.areaM2 })}
                </div>
              </div>
            ))}
            {zones.length === 0 && (
              <p className="text-muted" style={{ fontSize: 13 }}>
                {t("stock.noZones")}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
