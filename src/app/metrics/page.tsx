import { redirect } from "next/navigation";
import { getMyFacility } from "@/app/builder/actions";
import { auth } from "@/auth";
import { AppHeader } from "@/components/app-header";
import { getMetrics } from "./actions";

const REASON_LABEL: Record<string, string> = {
  receive: "IN",
  pick: "OUT",
  relocate: "MOVE",
  adjust: "ADJUST",
};

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

  const facility = await getMyFacility();
  if (!facility) {
    return (
      <main style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
        <p className="text-muted">No facility found for your organization yet.</p>
      </main>
    );
  }

  const data = await getMetrics();
  const kpis = data?.kpis;
  const zoneRows = data?.zoneRows ?? [];
  const log = data?.log ?? [];

  const kpiCards = kpis
    ? [
        { kicker: "Mapped floor", value: `${kpis.mappedAreaM2.toLocaleString("en-US")} m²`, meta: `${facility.widthM} × ${facility.heightM} m envelope · ${kpis.zoneCount} zones` },
        { kicker: "Live locations", value: kpis.liveLocations.toLocaleString("en-US"), meta: "storage locations addressed" },
        { kicker: "Occupancy", value: `${kpis.occPct}%`, meta: `of ${kpis.liveLocations} locations carrying stock` },
        { kicker: "Accounted SKUs", value: String(kpis.accountedSkus), meta: "every unit tied to a location" },
      ]
    : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", minHeight: 0, overflow: "hidden" }}>
      <AppHeader
        facilityName={facility.name}
        floorText={`${facility.widthM.toFixed(1)} × ${facility.heightM.toFixed(1)} m · metric`}
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
              Utilisation by zone
            </div>
            {zoneRows.map((z) => (
              <div key={z.id} style={{ padding: "11px 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 8%, transparent)" }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                  <span style={{ fontFamily: "var(--font-heading)", fontSize: 16, letterSpacing: ".05em" }}>{z.code} · {z.name}</span>
                  <span style={{ fontFamily: "var(--font-heading)", fontSize: 19, fontVariantNumeric: "tabular-nums" }}>{z.occPct}%</span>
                </div>
                <div style={{ marginTop: 7, height: 8, background: "var(--color-neutral-200)" }}>
                  <div style={{ width: `${z.occPct}%`, height: "100%", background: "var(--color-accent)" }} />
                </div>
                <div style={{ marginTop: 5, fontSize: 11, fontVariantNumeric: "tabular-nums", color: "color-mix(in srgb, var(--color-text) 50%, transparent)" }}>
                  {z.occupied} of {z.totalBins} locations · {z.areaM2} m²
                </div>
              </div>
            ))}
            {zoneRows.length === 0 && <p className="text-muted" style={{ fontSize: 13 }}>No zones on the blueprint yet.</p>}
          </div>

          <div>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 13, letterSpacing: ".16em", textTransform: "uppercase", marginBottom: 11 }}>
              Movement log
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>When</th><th>Who</th><th>Move</th><th>Item</th>
                  <th style={{ textAlign: "right" }}>Qty</th><th>From</th><th>To</th>
                </tr>
              </thead>
              <tbody>
                {log.map((m) => (
                  <tr key={m.id}>
                    <td style={{ fontVariantNumeric: "tabular-nums", fontSize: 12, whiteSpace: "nowrap" }}>{m.when}</td>
                    <td style={{ fontSize: 12, whiteSpace: "nowrap" }}>{m.who}</td>
                    <td><span style={reasonChip(m.reason)}>{REASON_LABEL[m.reason] ?? m.reason}</span></td>
                    <td style={{ fontSize: 12 }}>{m.itemName}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 12 }}>{m.quantity}</td>
                    <td style={{ fontSize: 12, fontVariantNumeric: "tabular-nums", color: "color-mix(in srgb, var(--color-text) 60%, transparent)" }}>{m.from}</td>
                    <td style={{ fontSize: 12, fontVariantNumeric: "tabular-nums", color: "var(--color-accent-700)" }}>{m.to}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {log.length === 0 && <p className="text-muted" style={{ fontSize: 13, marginTop: 10 }}>No movements recorded yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
