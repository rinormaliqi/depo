import Link from "next/link";
import { redirect } from "next/navigation";
import { getMyFacility } from "@/app/builder/actions";
import { getMyItems } from "@/app/items/actions";
import { auth } from "@/auth";
import { AppHeader } from "@/components/app-header";
import { getRecentMovements } from "./actions";
import { ScanForm } from "./scan-form";

const REASON_LABEL: Record<string, string> = {
  receive: "IN",
  pick: "OUT",
  relocate: "MOVE",
  adjust: "ADJUST",
};

export default async function ScannerPage() {
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

  const [items, recent] = await Promise.all([getMyItems(), getRecentMovements()]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", minHeight: 0, overflow: "hidden" }}>
      <AppHeader
        facilityName={facility.name}
        floorText={`${facility.widthM.toFixed(1)} × ${facility.heightM.toFixed(1)} m · metric`}
        userEmail={session.user.email ?? ""}
      />
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 26 }}>
        <div style={{ maxWidth: 880, margin: "0 auto", display: "flex", gap: 30, flexWrap: "wrap", alignItems: "flex-start" }}>
          {items.length === 0 ? (
            <p className="text-muted">
              No items in your catalog yet —{" "}
              <Link href="/items" className="underline">
                add one
              </Link>{" "}
              first.
            </p>
          ) : (
            <ScanForm items={items} />
          )}

          <div style={{ flex: 1, minWidth: 300 }}>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 13, letterSpacing: ".16em", textTransform: "uppercase", marginBottom: 11 }}>
              Recent movements
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>When</th><th>Move</th><th>Item</th>
                  <th style={{ textAlign: "right" }}>Qty</th><th>To</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((m) => (
                  <tr key={m.id}>
                    <td style={{ fontVariantNumeric: "tabular-nums", fontSize: 12, whiteSpace: "nowrap" }}>{m.when}</td>
                    <td style={{ fontSize: 11 }}>{REASON_LABEL[m.reason] ?? m.reason}</td>
                    <td style={{ fontSize: 12 }}>{m.itemName}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 12 }}>{m.quantity}</td>
                    <td style={{ fontSize: 12, fontVariantNumeric: "tabular-nums", color: "var(--color-accent-700)" }}>{m.to}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {recent.length === 0 && <p className="text-muted" style={{ fontSize: 13, marginTop: 10 }}>No movements yet.</p>}
            <div style={{ marginTop: 14, fontSize: 12, lineHeight: 1.55, color: "color-mix(in srgb, var(--color-text) 60%, transparent)", maxWidth: "44ch" }}>
              Every commit writes the item, its quantity and its exact location, so the blueprint and the ledger never drift apart.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
