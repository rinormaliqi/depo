"use client";

import { useMemo, useState } from "react";
import { formatDateTime } from "@/lib/format-date";
import { unwrap } from "@/lib/action-result";
import { listContactMessages, markContactMessageHandled as rawMarkHandled } from "./support-actions";

const markHandled = unwrap(rawMarkHandled);

type Data = Awaited<ReturnType<typeof listContactMessages>>;
type ContactMessage = Data[number];

const FILTERS = ["all", "unhandled", "handled"] as const;

function Row({ message }: { message: ContactMessage }) {
  const [handled, setHandled] = useState(message.handledAt !== null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle() {
    setBusy(true);
    setError(null);
    try {
      await markHandled(message.id);
      setHandled(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: "10px 0", borderBottom: "1px solid var(--color-divider)", fontSize: 13 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <strong>{message.name}</strong>
        {message.company && <span className="text-muted">· {message.company}</span>}
        <span className="text-muted">{message.email}</span>
        <span className="text-muted" style={{ fontSize: 11 }}>{formatDateTime(message.createdAt)}</span>
        {!message.sentAt && (
          <span className="tag" style={{ background: "var(--color-danger-100)", color: "var(--color-danger-700)", fontSize: 10 }}>
            email failed
          </span>
        )}
        <div style={{ marginLeft: "auto" }}>
          {handled ? (
            <span className="tag" style={{ fontSize: 10 }}>handled</span>
          ) : (
            <button className="btn btn-secondary" disabled={busy} onClick={handle} style={{ fontSize: 12 }}>
              Mark handled
            </button>
          )}
        </div>
      </div>
      <p style={{ margin: "6px 0 0", whiteSpace: "pre-wrap" }}>{message.message}</p>
      {error && <div style={{ marginTop: 4, fontSize: 11, color: "var(--color-accent-800)" }}>{error}</div>}
    </div>
  );
}

export function SupportView({ messages }: { messages: ContactMessage[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("unhandled");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return messages.filter((m) => {
      if (filter === "handled" && !m.handledAt) return false;
      if (filter === "unhandled" && m.handledAt) return false;
      if (!q) return true;
      return m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q) || (m.company ?? "").toLowerCase().includes(q);
    });
  }, [messages, query, filter]);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <input
          className="input"
          placeholder="Search by name, email or company…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: "1 1 260px", fontSize: 13 }}
        />
        <select className="input" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} style={{ fontSize: 13 }}>
          {FILTERS.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      </div>
      {filtered.map((m) => (
        <Row key={m.id} message={m} />
      ))}
      {filtered.length === 0 && <p className="text-muted" style={{ fontSize: 13, marginTop: 12 }}>No messages match.</p>}
    </div>
  );
}
