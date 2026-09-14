"use client";

import { useState } from "react";
import { formatDate } from "@/lib/format-date";
import { listOrganizations, updateOrgBilling } from "./actions";

type Data = Awaited<ReturnType<typeof listOrganizations>>;
type Org = Data["organizations"][number];
type Plan = Data["plans"][number];

const STATUSES = ["trialing", "active", "past_due", "canceled"] as const;

function toDateInputValue(d: Date | string | null) {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

function OrgRow({ org, plans }: { org: Org; plans: Plan[] }) {
  const [planId, setPlanId] = useState(org.planId);
  const [status, setStatus] = useState(org.subscriptionStatus);
  const [trialEndsAt, setTrialEndsAt] = useState(toDateInputValue(org.trialEndsAt));
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const dirty = planId !== org.planId || status !== org.subscriptionStatus || trialEndsAt !== toDateInputValue(org.trialEndsAt);

  async function save() {
    setBusy(true);
    try {
      await updateOrgBilling(org.id, { planId, subscriptionStatus: status, trialEndsAt: trialEndsAt || null });
      setSavedAt(Date.now());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr auto", gap: 8, alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--color-divider)", fontSize: 13 }}>
      <div>
        <div>{org.name}</div>
        <div style={{ fontSize: 11, color: "color-mix(in srgb,var(--color-text) 50%,transparent)" }}>
          {org.memberCount} member{org.memberCount === 1 ? "" : "s"} · joined {formatDate(org.createdAt)}
        </div>
      </div>
      <select className="input" value={planId} onChange={(e) => setPlanId(e.target.value)}>
        {plans.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
      <select className="input" value={status} onChange={(e) => setStatus(e.target.value as typeof STATUSES[number])}>
        {STATUSES.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
      <input className="input" type="date" value={trialEndsAt} onChange={(e) => setTrialEndsAt(e.target.value)} />
      <button className="btn btn-secondary" disabled={!dirty || busy} onClick={save} style={{ fontSize: 12 }}>
        {busy ? "…" : savedAt && !dirty ? "Saved" : "Save"}
      </button>
    </div>
  );
}

export function InternalClient({ organizations, plans }: { organizations: Org[]; plans: Plan[] }) {
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr auto", gap: 8, fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: "color-mix(in srgb,var(--color-text) 55%,transparent)", paddingBottom: 6, borderBottom: "1px solid var(--color-divider)" }}>
        <span>Organization</span>
        <span>Plan</span>
        <span>Status</span>
        <span>Trial ends</span>
        <span />
      </div>
      {organizations.map((org) => (
        <OrgRow key={org.id} org={org} plans={plans} />
      ))}
      {organizations.length === 0 && <p className="text-muted" style={{ fontSize: 13, marginTop: 12 }}>No organizations yet.</p>}
    </div>
  );
}
