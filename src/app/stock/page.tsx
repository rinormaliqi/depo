import { redirect } from "next/navigation";
import { getMyFacility } from "@/app/builder/actions";
import { auth } from "@/auth";
import { AppHeader } from "@/components/app-header";
import { getZoneUtilization, searchStock } from "./actions";
import { StockSearch } from "./stock-search";

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
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

  const { q } = await searchParams;
  const [initialResults, zones] = await Promise.all([
    q ? searchStock(q) : Promise.resolve([]),
    getZoneUtilization(),
  ]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", minHeight: 0, overflow: "hidden" }}>
      <AppHeader
        facilityName={facility.name}
        floorText={`${facility.widthM.toFixed(1)} × ${facility.heightM.toFixed(1)} m · metric`}
        userEmail={session.user.email ?? ""}
      />
      <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "minmax(0,280px) 1fr", overflow: "auto" }}>
        <div style={{ borderRight: "1px solid var(--color-divider)", background: "#fff", overflow: "auto", padding: 13 }}>
          <StockSearch initialQuery={q ?? ""} initialResults={initialResults} />
        </div>

        <div style={{ padding: 22, overflow: "auto" }}>
          <div
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: 13,
              letterSpacing: ".16em",
              textTransform: "uppercase",
              marginBottom: 11,
            }}
          >
            Zone utilisation
          </div>
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
                  {z.occupied} of {z.totalBins} locations occupied · {z.areaM2} m²
                </div>
              </div>
            ))}
            {zones.length === 0 && (
              <p className="text-muted" style={{ fontSize: 13 }}>
                No zones on the blueprint yet.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
