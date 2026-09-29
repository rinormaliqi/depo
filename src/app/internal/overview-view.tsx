import { getPlatformOverview } from "./overview-actions";

type Overview = Awaited<ReturnType<typeof getPlatformOverview>>;

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{ border: "1px solid var(--color-divider)", borderRadius: 8, padding: "12px 14px", minWidth: 140 }}>
      <div style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: "color-mix(in srgb,var(--color-text) 55%,transparent)" }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontFamily: "var(--font-heading)", marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "color-mix(in srgb,var(--color-text) 55%,transparent)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export async function OverviewView() {
  const data: Overview = await getPlatformOverview();

  return (
    <div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 22 }}>
        <StatCard label="Organizations" value={data.totalOrganizations} />
        <StatCard label="Trialing" value={data.statusCounts.trialing} />
        <StatCard label="Active" value={data.statusCounts.active} />
        <StatCard label="Past due" value={data.statusCounts.past_due} />
        <StatCard label="Canceled" value={data.statusCounts.canceled} />
        <StatCard label="Suspended" value={data.suspendedCount} />
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 28 }}>
        <StatCard label="New (30d)" value={data.newLast30Days} />
        <StatCard label="New (90d)" value={data.newLast90Days} />
        <StatCard label="MRR (estimate)" value={formatMoney(data.mrrCents, data.mrrCurrency)} sub="Active orgs' current plan price, not an accounting figure" />
      </div>

      <div style={{ fontFamily: "var(--font-heading)", fontSize: 16, marginBottom: 8 }}>
        Most active organizations ({data.activityWindowDays}d)
      </div>
      {data.mostActive.length === 0 ? (
        <p className="text-muted" style={{ fontSize: 13 }}>No stock movements in this window yet.</p>
      ) : (
        <div style={{ fontSize: 13, marginBottom: 24 }}>
          {data.mostActive.map((org, i) => (
            <div key={org.organizationId} style={{ display: "flex", gap: 10, padding: "6px 0", borderBottom: "1px solid var(--color-divider)" }}>
              <span className="text-muted" style={{ width: 20 }}>{i + 1}.</span>
              <span style={{ flex: 1 }}>{org.name}</span>
              <span className="text-muted">{org.movementCount} movements</span>
            </div>
          ))}
        </div>
      )}

      {data.sentryUrl && (
        <p className="text-muted" style={{ fontSize: 13 }}>
          Error rate: <a href={data.sentryUrl} target="_blank" rel="noreferrer" style={{ color: "var(--color-accent)" }}>view in Sentry ↗</a>
        </p>
      )}
    </div>
  );
}
