"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import * as rawActions from "./actions";
import { unwrap } from "@/lib/action-result";
import { CameraScanner } from "./camera-scanner";
import { useNotify } from "@/components/notifications";

const commitScan = unwrap(rawActions.commitScan);
const resolveScan = unwrap(rawActions.resolveScan);

type Item = { id: string; name: string; sku: string | null; unitOfMeasure: string };

export function ScanForm({ items }: { items: Item[] }) {
  const t = useTranslations("scanner");
  const router = useRouter();
  const [itemId, setItemId] = useState(items[0]?.id ?? "");
  const [quantity, setQuantity] = useState("");
  const [code, setCode] = useState("");
  const notify = useNotify();
  const [busy, setBusy] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);

  // The camera pre-fills the location field rather than committing on its
  // own: item and quantity are still the worker's to confirm, and a torn
  // or missing label falls back to typing the code into the same field.
  const handleDecode = useCallback(async (raw: string) => {
    setCameraOpen(false);
    const resolved = await notify.run(() => resolveScan(raw));
    if (resolved) setCode(resolved.code);
  }, [notify]);

  const selectedItem = items.find((i) => i.id === itemId);

  async function handleCommit() {
    const qty = parseInt(quantity, 10);
    if (!itemId) {
      notify.warning(t("errorPickItem"));
      return;
    }
    if (!qty || qty < 1) {
      notify.warning(t("errorQuantity"));
      return;
    }
    setBusy(true);
    const done = await notify.run(() => commitScan(itemId, qty, code), {
      success: t("successBooked", {
        qty,
        unit: selectedItem?.unitOfMeasure ?? "",
        name: selectedItem?.name ?? "",
        code: code.trim().toUpperCase(),
      }),
    });
    setBusy(false);
    if (done === undefined) return;
    setQuantity("");
    router.refresh();
  }

  return (
    <div className="blueprint scan-form" style={{ padding: 10, background: "#fff", boxShadow: "var(--shadow-lg)" }}>
      <i className="corner tl" /><i className="corner tr" /><i className="corner bl" /><i className="corner br" />
      <div style={{ border: "1px solid var(--color-divider)", padding: 13, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ border: "1px dashed var(--color-accent-500)", background: "var(--color-accent-100)", height: 110, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5, padding: "0 12px", textAlign: "center" }}>
          <div style={{ fontSize: 10, letterSpacing: ".16em", color: "var(--color-accent-700)" }}>{t("itemKicker")}</div>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 18, letterSpacing: ".03em" }}>
            {selectedItem ? selectedItem.name : t("selectItem")}
          </div>
          {selectedItem?.sku && (
            <div style={{ fontSize: 11, color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>{selectedItem.sku}</div>
          )}
        </div>

        <div className="field">
          <label>{t("item")}</label>
          <select className="input" value={itemId} onChange={(e) => setItemId(e.target.value)}>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
                {i.sku ? ` (${i.sku})` : ""}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 9 }}>
          <div className="field">
            <label>{t("quantity")}</label>
            <input className="input" type="number" inputMode="numeric" min="1" placeholder="200" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div className="field">
            <label>{t("location")}</label>
            <input className="input" type="text" autoCapitalize="characters" autoCorrect="off" placeholder="A-01-3" value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
        </div>
        <div style={{ fontSize: 10, color: "color-mix(in srgb, var(--color-text) 50%, transparent)", marginTop: -4 }}>
          {t("locationHint")}
        </div>
        <button type="button" className="btn btn-secondary btn-block" onClick={() => setCameraOpen(true)} disabled={busy}>
          {t("scanWithCamera")}
        </button>
        <button className="btn btn-primary btn-block" onClick={handleCommit} disabled={busy} style={{ minHeight: 46 }}>
          {t("commit")}
        </button>
      </div>
      {cameraOpen && <CameraScanner onDecode={handleDecode} onClose={() => setCameraOpen(false)} />}
    </div>
  );
}
