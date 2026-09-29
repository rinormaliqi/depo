"use client";

import { useMemo, useState } from "react";
import { formatDate } from "@/lib/format-date";
import { unwrap } from "@/lib/action-result";
import * as rawActions from "./user-actions";
import { listUsersForAdmin } from "./user-actions";

const forceSignOut = unwrap(rawActions.forceSignOut);
const disableUser = unwrap(rawActions.disableUser);
const reactivateUser = unwrap(rawActions.reactivateUser);

type Data = Awaited<ReturnType<typeof listUsersForAdmin>>;
type PlatformUser = Data[number];

function UserRow({ user }: { user: PlatformUser }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [disabled, setDisabled] = useState(user.disabledAt !== null);
  const [disabledReason, setDisabledReason] = useState(user.disabledReason);

  async function runForceSignOut() {
    setBusy(true);
    setError(null);
    try {
      await forceSignOut(user.id);
      setNotice("Signed out everywhere");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError(null);
    try {
      await disableUser(user.id, reason);
      setDisabled(true);
      setDisabledReason(reason.trim());
      setReasonOpen(false);
      setReason("");
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
      await reactivateUser(user.id);
      setDisabled(false);
      setDisabledReason(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: "10px 0", borderBottom: "1px solid var(--color-divider)", fontSize: 13 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ minWidth: 180 }}>
          {user.name}
          {disabled && (
            <span className="tag" style={{ marginLeft: 6, background: "var(--color-danger-100)", color: "var(--color-danger-700)", fontSize: 10 }}>
              disabled
            </span>
          )}
        </div>
        <span className="text-muted" style={{ minWidth: 220 }}>{user.email}</span>
        <span className="text-muted" style={{ fontSize: 11 }}>
          {user.emailVerifiedAt ? "verified" : "unverified"} · joined {formatDate(user.createdAt)}
        </span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          <button className="btn btn-ghost" disabled={busy} onClick={runForceSignOut} style={{ fontSize: 12 }} title="Bump session version — every existing session is refused">
            Force sign-out
          </button>
          {disabled ? (
            <button className="btn btn-secondary" disabled={busy} onClick={reactivate} style={{ fontSize: 12 }}>
              Reactivate
            </button>
          ) : (
            <button className="btn btn-danger" disabled={busy} onClick={() => setReasonOpen((o) => !o)} style={{ fontSize: 12 }}>
              Disable
            </button>
          )}
        </div>
      </div>
      {user.memberships.length > 0 && (
        <div style={{ marginTop: 4, fontSize: 11, color: "color-mix(in srgb,var(--color-text) 55%,transparent)" }}>
          {user.memberships.map((m) => `${m.orgName} (${m.role})`).join(" · ")}
        </div>
      )}
      {disabled && disabledReason && (
        <div style={{ marginTop: 4, fontSize: 11, color: "var(--color-accent-800)" }}>Disabled: {disabledReason}</div>
      )}
      {reasonOpen && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
          <input
            className="input"
            placeholder="Reason for disabling"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            style={{ flex: 1, fontSize: 12 }}
          />
          <button className="btn btn-danger" disabled={busy || !reason.trim()} onClick={disable} style={{ fontSize: 12 }}>
            Confirm disable
          </button>
        </div>
      )}
      {notice && <div style={{ marginTop: 4, fontSize: 11 }} className="text-muted">{notice}</div>}
      {error && <div style={{ marginTop: 4, fontSize: 11, color: "var(--color-accent-800)" }}>{error}</div>}
    </div>
  );
}

export function UsersClient({ users }: { users: PlatformUser[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => u.email.toLowerCase().includes(q) || u.name.toLowerCase().includes(q));
  }, [users, query]);

  return (
    <div>
      <input
        className="input"
        placeholder="Search by name or email…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ width: "100%", marginBottom: 14, fontSize: 13 }}
      />
      {filtered.map((u) => (
        <UserRow key={u.id} user={u} />
      ))}
      {filtered.length === 0 && <p className="text-muted" style={{ fontSize: 13, marginTop: 12 }}>No users match.</p>}
    </div>
  );
}
