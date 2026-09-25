import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getMyFacility } from "@/app/builder/actions";
import { auth } from "@/auth";
import { AppHeader } from "@/components/app-header";
import { getMetrics } from "./actions";
import { getCapabilities } from "@/lib/capabilities";
import { NotForRole } from "@/components/not-for-role";

function reasonChip(reason: string) {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    padding: "2px 8px",
    fontSize: 10,
    letterSpacing: ".04em",
    whiteSpace: "nowrap",
  };
  if (reason === "receive") {
    return { ...base, background: "color-mix(in srgb, oklch(0.56 0.07 150) 14%, #fff)", color: "oklch(0.56 0.07 150)" };
  }
  if (reason === "pick") {
    return { ...base, background: "var(--color-accent-100)", color: "var(--color-accent-800)" };
  }
  return { ...base, background: "var(--color-neutral-100)", color: "var(--color-neutral-800)" };
}

export default async function MetricsPage() {
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

  const caps = await getCapabilities();
  if (!caps?.can.viewMetrics) return <NotForRole capability="viewMetrics" />;
  const data = await getMetrics();
  const kpis = data?.kpis;
  const zoneRows = data?.zoneRows ?? [];
  const log = data?.log ?? [];

  const kpiCards = kpis
    ? [
        { kicker: t("metrics.mappedFloor"), value: `${kpis.mappedAreaM2.toLocaleString("en-US")} m²`, meta: t("metrics.mappedFloorMeta", { width: facility.widthM, height: facility.heightM, zones: kpis.zoneCount }) },
        { kicker: t("metrics.liveLocations"), value: kpis.liveLocations.toLocaleString("en-US"), meta: t("metrics.liveLocationsMeta") },
        { kicker: t("metrics.occupancy"), value: `${kpis.occPct}%`, meta: t("metrics.occupancyMeta", { n: kpis.liveLocations }) },
        { kicker: t("metrics.accountedSkus"), value: String(kpis.accountedSkus), meta: t("metrics.accountedSkusMeta") },
      ]
    : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", minHeight: 0, overflow: "hidden" }}>
      <AppHeader
        facilityId={facility.id}
          facilityName={facility.name}
        floorText={t("common.floorText", { width: facility.widthM.toFixed(1), height: facility.heightM.toFixed(1) })}
        userEmail={session.user.email ?? ""}
      />
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "22px 26px 40px" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 16 }}>
            {kpiCards.map((k) => (
              <div key={k.kicker} className="card blueprint" style={{ gap: 4 }}>
                <i className="corner tl" /><i className="corner tr" /><i className="corner bl" /><i className="corner br" />
                <div className="card-kicker">{k.kicker}</div>
                <div style={{ fontFamily: "var(--font-heading)", fontSize: 40, lineHeight: 1, letterSpacing: ".01em", fontVariantNumeric: "tabular-nums" }}>
                  {k.value}
                </div>
                <div className="card-meta">{k.meta}</div>
              </div>
            ))}
          </div>

          <div>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 13, letterSpacing: ".16em", textTransform: "uppercase", marginBottom: 11 }}>
              {t("metrics.utilisationByZone")}
            </div>
            {zoneRows.map((z) => (
              <div key={z.id} style={{ padding: "11px 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 8%, transparent)" }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                  <span style={{ fontFamily: "var(--font-heading)", fontSize: 16, letterSpacing: ".05em" }}>{z.code} · {z.name}</span>
                  {/* A zone holding no bins — receiving, shipping, an office
                      — has no occupancy to report, and a 0% sitting among the
                      real figures reads as a bad one. */}
                  <span style={{ fontFamily: "var(--font-heading)", fontSize: 19, fontVariantNumeric: "tabular-nums" }}>{z.totalBins > 0 ? `${z.occPct}%` : "—"}</span>
                </div>
                {z.totalBins > 0 && (
                  <div style={{ marginTop: 7, height: 8, background: "var(--color-neutral-200)" }}>
                    <div style={{ width: `${z.occPct}%`, height: "100%", background: "var(--color-accent)" }} />
                  </div>
                )}
                <div style={{ marginTop: 5, fontSize: 11, fontVariantNumeric: "tabular-nums", color: "color-mix(in srgb, var(--color-text) 50%, transparent)" }}>
                  {z.totalBins > 0
                    ? t("metrics.locationsAreaM2", { occupied: z.occupied, total: z.totalBins, area: z.areaM2 })
                    : t("metrics.noStorage", { area: z.areaM2 })}
                </div>
              </div>
            ))}
            {zoneRows.length === 0 && <p className="text-muted" style={{ fontSize: 13 }}>{t("metrics.noZones")}</p>}
          </div>

          <div>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 13, letterSpacing: ".16em", textTransform: "uppercase", marginBottom: 11 }}>
              {t("metrics.movementLog")}
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>{t("metrics.when")}</th><th>{t("metrics.who")}</th><th>{t("metrics.move")}</th><th>{t("metrics.item")}</th>
                  <th style={{ textAlign: "right" }}>{t("metrics.qty")}</th><th>{t("metrics.from")}</th><th>{t("metrics.to")}</th>
                </tr>
              </thead>
              <tbody>
                {log.map((m) => (
                  <tr key={m.id}>
                    <td style={{ fontVariantNumeric: "tabular-nums", fontSize: 12, whiteSpace: "nowrap" }}>{m.when}</td>
                    <td style={{ fontSize: 12, whiteSpace: "nowrap" }}>{m.who}</td>
                    <td><span style={reasonChip(m.reason)}>{t(`common.reason.${m.reason}` as "common.reason.receive")}</span></td>
                    <td style={{ fontSize: 12 }}>{m.itemName}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 12 }}>{m.quantity}</td>
                    <td style={{ fontSize: 12, fontVariantNumeric: "tabular-nums", color: "color-mix(in srgb, var(--color-text) 60%, transparent)" }}>{m.from}</td>
                    <td style={{ fontSize: 12, fontVariantNumeric: "tabular-nums", color: "var(--color-accent-700)" }}>{m.to}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {log.length === 0 && <p className="text-muted" style={{ fontSize: 13, marginTop: 10 }}>{t("metrics.noMovements")}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
