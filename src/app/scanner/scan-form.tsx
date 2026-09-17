"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import * as rawActions from "./actions";
import { unwrap } from "@/lib/action-result";

const commitScan = unwrap(rawActions.commitScan);

type Item = { id: string; name: string; sku: string | null; unitOfMeasure: string };

export function ScanForm({ items }: { items: Item[] }) {
  const t = useTranslations("scanner");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [itemId, setItemId] = useState(items[0]?.id ?? "");
  const [quantity, setQuantity] = useState("");
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedItem = items.find((i) => i.id === itemId);

  async function handleCommit() {
    setMsg(null);
    const qty = parseInt(quantity, 10);
    if (!itemId) {
      setMsg({ text: t("errorPickItem"), ok: false });
      return;
    }
    if (!qty || qty < 1) {
      setMsg({ text: t("errorQuantity"), ok: false });
      return;
    }
    setBusy(true);
    try {
      await commitScan(itemId, qty, code);
      setMsg({
        text: t("successBooked", {
          qty,
          unit: selectedItem?.unitOfMeasure ?? "",
          name: selectedItem?.name ?? "",
          code: code.trim().toUpperCase(),
        }),
        ok: true,
      });
      setQuantity("");
      router.refresh();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : tCommon("errorGeneric"), ok: false });
    } finally {
      setBusy(false);
    }
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
        <button className="btn btn-primary btn-block" onClick={handleCommit} disabled={busy} style={{ minHeight: 46 }}>
          {t("commit")}
        </button>
        {msg && (
          <div
            style={{
              padding: "8px 10px",
              fontSize: 12,
              lineHeight: 1.4,
              background: msg.ok ? "color-mix(in srgb, oklch(0.56 0.07 150) 12%, #fff)" : "color-mix(in srgb, oklch(0.62 0.10 68) 14%, #fff)",
              color: msg.ok ? "oklch(0.56 0.07 150)" : "oklch(0.62 0.10 68)",
              border: `1px solid ${msg.ok ? "oklch(0.56 0.07 150)" : "oklch(0.62 0.10 68)"}`,
            }}
          >
            {msg.text}
          </div>
        )}
      </div>
    </div>
  );
}
