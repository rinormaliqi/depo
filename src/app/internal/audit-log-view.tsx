import { formatDateTime } from "@/lib/format-date";
import { listAuditLog } from "./actions";

type Entry = Awaited<ReturnType<typeof listAuditLog>>[number];

function MetadataCell({ metadata }: { metadata: Entry["metadata"] }) {
  if (!metadata) return null;
  return (
    <pre style={{ margin: 0, fontSize: 11, whiteSpace: "pre-wrap", color: "color-mix(in srgb,var(--color-text) 65%,transparent)" }}>
      {JSON.stringify(metadata, null, 2)}
    </pre>
  );
}

export async function AuditLogView() {
  const entries = await listAuditLog();

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1.4fr 2fr", gap: 8, fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: "color-mix(in srgb,var(--color-text) 55%,transparent)", paddingBottom: 6, borderBottom: "1px solid var(--color-divider)" }}>
        <span>When</span>
        <span>Actor</span>
        <span>Action / target</span>
        <span>Details</span>
      </div>
      {entries.map((e) => (
        <div key={e.id} style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1.4fr 2fr", gap: 8, padding: "8px 0", borderBottom: "1px solid var(--color-divider)", fontSize: 13 }}>
          <span>{formatDateTime(e.createdAt)}</span>
          <span>{e.actorEmail}</span>
          <span>
            {e.action}
            <div style={{ fontSize: 11, color: "color-mix(in srgb,var(--color-text) 55%,transparent)" }}>
              {e.targetType}:{e.targetId}
            </div>
          </span>
          <MetadataCell metadata={e.metadata} />
        </div>
      ))}
      {entries.length === 0 && <p className="text-muted" style={{ fontSize: 13, marginTop: 12 }}>No admin actions recorded yet.</p>}
    </div>
  );
}
