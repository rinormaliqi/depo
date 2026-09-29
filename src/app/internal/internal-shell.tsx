"use client";

import { type ReactNode, useState } from "react";

const TABS = [
  { key: "organizations", label: "Organizations" },
  { key: "users", label: "Users" },
  { key: "support", label: "Support" },
  { key: "audit", label: "Audit log" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

// display:none rather than conditional rendering — switching tabs keeps
// each tab's own state (e.g. an org row mid-edit) instead of losing it,
// and the audit log was already fetched once server-side, not re-fetched.
export function InternalShell({
  organizationsTab,
  usersTab,
  supportTab,
  auditLogTab,
}: {
  organizationsTab: ReactNode;
  usersTab: ReactNode;
  supportTab: ReactNode;
  auditLogTab: ReactNode;
}) {
  const [tab, setTab] = useState<TabKey>("organizations");

  return (
    <div>
      <div style={{ display: "flex", gap: 4, marginBottom: 18, borderBottom: "1px solid var(--color-divider)" }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              background: "none",
              border: "none",
              borderBottom: tab === t.key ? "2px solid var(--color-primary-600)" : "2px solid transparent",
              padding: "8px 12px",
              fontSize: 13,
              fontWeight: tab === t.key ? 600 : 400,
              color: tab === t.key ? "var(--color-text)" : "color-mix(in srgb,var(--color-text) 55%,transparent)",
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div style={{ display: tab === "organizations" ? "block" : "none" }}>{organizationsTab}</div>
      <div style={{ display: tab === "users" ? "block" : "none" }}>{usersTab}</div>
      <div style={{ display: tab === "support" ? "block" : "none" }}>{supportTab}</div>
      <div style={{ display: tab === "audit" ? "block" : "none" }}>{auditLogTab}</div>
    </div>
  );
}
