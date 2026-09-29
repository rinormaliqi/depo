"use client";

import { useEffect, useState } from "react";
import { formatDate, formatDateTime } from "@/lib/format-date";
import { unwrap } from "@/lib/action-result";
import * as rawActions from "./actions";
import { startViewAs as rawStartViewAs } from "./view-as-actions";

const getOrgDetail = unwrap(rawActions.getOrgDetail);
const suspendOrganization = unwrap(rawActions.suspendOrganization);
const reactivateOrganization = unwrap(rawActions.reactivateOrganization);
const startViewAs = unwrap(rawStartViewAs);

type Detail = Awaited<ReturnType<typeof getOrgDetail>>;

// Rendered inline under an OrgRow once "Details" is toggled open — fetches
// on mount rather than needing a separate load button, since opening the
// row already is the action that wants this data.
export function OrgDetailPanel({ orgId, suspendedAt, suspendedReason }: { orgId: string; suspendedAt: Date | string | null; suspendedReason: string | null }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reasonInput, setReasonInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [suspended, setSuspended] = useState(suspendedAt !== null);
  const [reason, setReason] = useState(suspendedReason);

  useEffect(() => {
    let cancelled = false;
    getOrgDetail(orgId)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  async function suspend() {
    setBusy(true);
    setError(null);
    try {
      await suspendOrganization(orgId, reasonInput);
      setSuspended(true);
      setReason(reasonInput.trim());
      setReasonInput("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function reactivate() {
    setBusy(true);
    setError(null);
    try {
      await reactivateOrganization(orgId);
      setSuspended(false);
      setReason(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function viewAs() {
    setBusy(true);
    setError(null);
    try {
      await startViewAs(orgId);
      // startViewAs redirects server-side on success; reaching here means
      // it didn't (e.g. dev-mode error boundary), so just stop spinning.
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ gridColumn: "1 / -1", padding: "10px 0", fontSize: 12, borderTop: "1px dashed var(--color-divider)", display: "flex", flexDirection: "column", gap: 10 }}>
      {!detail && !error && <span className="text-muted">Loading…</span>}
      {error && <span style={{ color: "var(--color-accent-800)" }}>{error}</span>}
      {detail && (
        <>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            <span>
              <strong>{detail.facilities.length}</strong> facilit{detail.facilities.length === 1 ? "y" : "ies"}
            </span>
            <span>
              <strong>{detail.itemCount}</strong> items
            </span>
            <span>Last activity: {detail.lastActivityAt ? formatDateTime(detail.lastActivityAt) : "never"}</span>
          </div>
          <div>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "color-mix(in srgb,var(--color-text) 55%,transparent)", marginBottom: 4 }}>
              Members
            </div>
            {detail.members.map((m) => (
              <div key={m.userId} style={{ display: "flex", gap: 10, padding: "2px 0" }}>
                <span style={{ minWidth: 140 }}>{m.name}</span>
                <span className="text-muted" style={{ minWidth: 200 }}>{m.email}</span>
                <span className="text-muted" style={{ minWidth: 60 }}>{m.role}</span>
                <span className="text-muted">joined {formatDate(m.joinedAt)}</span>
              </div>
            ))}
          </div>
        </>
      )}
      <div style={{ display: "flex", gap: 8, alignItems: "center", paddingTop: 6, borderTop: "1px solid var(--color-divider)" }}>
        <button className="btn btn-secondary" disabled={busy} onClick={viewAs} style={{ fontSize: 12 }} title="Read-only, 30 minutes, logged">
          View as
        </button>
        {suspended ? (
          <>
            <span style={{ color: "var(--color-accent-800)" }}>Suspended{reason ? `: ${reason}` : ""}</span>
            <button className="btn btn-secondary" disabled={busy} onClick={reactivate} style={{ fontSize: 12 }}>
              Reactivate
            </button>
          </>
        ) : (
          <>
            <input
              className="input"
              placeholder="Reason for suspension"
              value={reasonInput}
              onChange={(e) => setReasonInput(e.target.value)}
              style={{ flex: 1, fontSize: 12 }}
            />
            <button className="btn btn-danger" disabled={busy || !reasonInput.trim()} onClick={suspend} style={{ fontSize: 12 }}>
              Suspend
            </button>
          </>
        )}
      </div>
    </div>
  );
}
