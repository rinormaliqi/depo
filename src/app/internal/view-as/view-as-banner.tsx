"use client";

import { useEffect, useState } from "react";
import { unwrap } from "@/lib/action-result";
import { endViewAs as rawEndViewAs } from "../view-as-actions";

const endViewAs = unwrap(rawEndViewAs);

function minutesLeft(expiresAt: Date | string) {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 60_000));
}

// Always visible, always on top — the whole point of view-as being
// read-only is worth nothing if the person browsing it can forget they're
// looking at someone else's company. A live countdown, not just a static
// "expires at", is what makes the time limit actually felt.
export function ViewAsBanner({ organizationName, expiresAt }: { organizationName: string; expiresAt: Date | string }) {
  const [minutes, setMinutes] = useState(() => minutesLeft(expiresAt));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setMinutes(minutesLeft(expiresAt)), 15_000);
    return () => clearInterval(id);
  }, [expiresAt]);

  async function exit() {
    setBusy(true);
    try {
      await endViewAs();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 16px",
        background: "var(--color-danger-500)",
        color: "#fff",
        fontSize: 13,
      }}
    >
      <strong>Viewing as {organizationName} — read only</strong>
      <span style={{ opacity: 0.85 }}>{minutes > 0 ? `expires in ${minutes} min` : "expired"}</span>
      <button
        className="btn"
        disabled={busy}
        onClick={exit}
        style={{ marginLeft: "auto", background: "#fff", color: "var(--color-danger-700)", border: "none", padding: "4px 10px", fontSize: 12, borderRadius: 6, cursor: "pointer" }}
      >
        Exit view-as
      </button>
    </div>
  );
}
