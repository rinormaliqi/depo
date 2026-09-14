"use client";

import { useState } from "react";
import { formatDate } from "@/lib/format-date";
import { listOrganizations, recordManualPayment, updateOrgBilling } from "./actions";

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
  const [paidUntil, setPaidUntil] = useState(toDateInputValue(org.paidUntil));
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [payMonths, setPayMonths] = useState("1");
  const [payNote, setPayNote] = useState("");
  const [payError, setPayError] = useState<string | null>(null);

  const dirty =
    planId !== org.planId ||
    status !== org.subscriptionStatus ||
    trialEndsAt !== toDateInputValue(org.trialEndsAt) ||
    paidUntil !== toDateInputValue(org.paidUntil);

  async function save() {
    setBusy(true);
    try {
      await updateOrgBilling(org.id, { planId, subscriptionStatus: status, trialEndsAt: trialEndsAt || null, paidUntil: paidUntil || null });
      setSavedAt(Date.now());
    } finally {
      setBusy(false);
    }
  }

  async function recordPayment() {
    setBusy(true);
    setPayError(null);
    try {
      await recordManualPayment(org.id, { planId, months: Number(payMonths), note: payNote });
      setPayOpen(false);
      setPayNote("");
    } catch (e) {
      setPayError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr 1fr auto", gap: 8, alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--color-divider)", fontSize: 13 }}>
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
      <input className="input" type="date" value={trialEndsAt} onChange={(e) => setTrialEndsAt(e.target.value)} title="Trial ends" />
      <input className="input" type="date" value={paidUntil} onChange={(e) => setPaidUntil(e.target.value)} title="Paid until (blank on an active org = indefinitely)" />
      <div style={{ display: "flex", gap: 4 }}>
        <button className="btn btn-secondary" disabled={!dirty || busy} onClick={save} style={{ fontSize: 12 }}>
          {busy ? "…" : savedAt && !dirty ? "Saved" : "Save"}
        </button>
        <button className="btn btn-ghost" disabled={busy} onClick={() => setPayOpen((o) => !o)} style={{ fontSize: 12 }} title="Record a bank transfer: extends paid-until by N months on the selected plan">
          + Payment
        </button>
      </div>
      {payOpen && (
        <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, alignItems: "center", padding: "6px 0 2px", fontSize: 12 }}>
          <span className="text-muted">Record manual payment on the plan selected above:</span>
          <input className="input" type="number" min={1} step={1} value={payMonths} onChange={(e) => setPayMonths(e.target.value)} style={{ width: 70 }} title="Months" />
          <span className="text-muted">months</span>
          <input className="input" value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="Note, e.g. bank transfer ref" style={{ flex: 1 }} />
          <button className="btn btn-primary" disabled={busy} onClick={recordPayment} style={{ fontSize: 12 }}>Apply</button>
          {payError && <span style={{ color: "var(--color-accent-800)" }}>{payError}</span>}
        </div>
      )}
    </div>
  );
}

export function InternalClient({ organizations, plans }: { organizations: Org[]; plans: Plan[] }) {
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr 1fr auto", gap: 8, fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: "color-mix(in srgb,var(--color-text) 55%,transparent)", paddingBottom: 6, borderBottom: "1px solid var(--color-divider)" }}>
        <span>Organization</span>
        <span>Plan</span>
        <span>Status</span>
        <span>Trial ends</span>
        <span>Paid until</span>
        <span />
      </div>
      {organizations.map((org) => (
        <OrgRow key={org.id} org={org} plans={plans} />
      ))}
      {organizations.length === 0 && <p className="text-muted" style={{ fontSize: 13, marginTop: 12 }}>No organizations yet.</p>}
    </div>
  );
}
