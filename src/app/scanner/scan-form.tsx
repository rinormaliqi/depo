"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import * as rawActions from "./actions";
import type { ScanAction } from "./actions";
import { unwrap } from "@/lib/action-result";
import { CameraScanner } from "./camera-scanner";
import { useNotify } from "@/components/notifications";
import { Gate } from "@/components/capabilities";
import { MAX_MOVEMENT_QUANTITY } from "@/lib/stock-limits";

const commitScan = unwrap(rawActions.commitScan);
const resolveScan = unwrap(rawActions.resolveScan);

type Item = { id: string; name: string; sku: string | null; unitOfMeasure: string };

const ACTIONS: ScanAction[] = ["receive", "move", "sale", "remove"];

export function ScanForm({ items }: { items: Item[] }) {
  const t = useTranslations("scanner");
  const router = useRouter();
  const [action, setAction] = useState<ScanAction>("receive");
  const [itemId, setItemId] = useState(items[0]?.id ?? "");
  const [quantity, setQuantity] = useState("");
  const [code, setCode] = useState("");
  const [toCode, setToCode] = useState("");
  const notify = useNotify();
  const [busy, setBusy] = useState(false);
  // Which field a camera scan should fill — only "move" has two locations
  // to aim at, so this only ever differs from "code" in that mode.
  const [scanTarget, setScanTarget] = useState<"code" | "toCode">("code");
  const [cameraOpen, setCameraOpen] = useState(false);

  // The camera pre-fills the location field rather than committing on its
  // own: item and quantity are still the worker's to confirm, and a torn
  // or missing label falls back to typing the code into the same field.
  const handleDecode = useCallback(
    async (raw: string) => {
      setCameraOpen(false);
      const resolved = await notify.run(() => resolveScan(raw));
      if (!resolved) return;
      if (scanTarget === "toCode") setToCode(resolved.code);
      else setCode(resolved.code);
    },
    [notify, scanTarget],
  );

  function openCameraFor(target: "code" | "toCode") {
    setScanTarget(target);
    setCameraOpen(true);
  }

  const selectedItem = items.find((i) => i.id === itemId);

  function changeAction(next: ScanAction) {
    setAction(next);
    if (next !== "move") setToCode("");
  }

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
    if (action === "move" && !toCode.trim()) {
      notify.warning(t("errorEnterDestination"));
      return;
    }
    setBusy(true);
    const successKey = { receive: "successBooked", move: "successMoved", sale: "successSold", remove: "successRemoved" }[action] as
      | "successBooked"
      | "successMoved"
      | "successSold"
      | "successRemoved";
    const done = await notify.run(() => commitScan(action, itemId, qty, code, action === "move" ? toCode : undefined), {
      success: t(successKey, {
        qty,
        unit: selectedItem?.unitOfMeasure ?? "",
        name: selectedItem?.name ?? "",
        code: code.trim().toUpperCase(),
        toCode: toCode.trim().toUpperCase(),
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
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${ACTIONS.length}, 1fr)`, gap: 6 }}>
          {ACTIONS.map((a) => (
            <button
              key={a}
              type="button"
              className={a === action ? "btn btn-primary" : "btn btn-secondary"}
              onClick={() => changeAction(a)}
              disabled={busy}
              style={{ padding: "8px 4px", fontSize: 12 }}
            >
              {t(`action${a.charAt(0).toUpperCase()}${a.slice(1)}` as "actionReceive")}
            </button>
          ))}
        </div>

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
            <input className="input" type="number" inputMode="numeric" min="1" max={MAX_MOVEMENT_QUANTITY} placeholder="200" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div className="field">
            <label>{action === "move" ? t("locationFrom") : t("location")}</label>
            <input className="input" type="text" autoCapitalize="characters" autoCorrect="off" placeholder="A-01-3" value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
        </div>
        {action === "move" && (
          <div className="field">
            <label>{t("destination")}</label>
            <input className="input" type="text" autoCapitalize="characters" autoCorrect="off" placeholder="B-02-1" value={toCode} onChange={(e) => setToCode(e.target.value)} />
          </div>
        )}
        <div style={{ fontSize: 10, color: "color-mix(in srgb, var(--color-text) 50%, transparent)", marginTop: -4 }}>
          {t("locationHint")}
        </div>
        <Gate capability="cameraScanning" mode="disable">
          {action === "move" ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <button type="button" className="btn btn-secondary btn-block" onClick={() => openCameraFor("code")} disabled={busy}>
                {t("scanWithCamera")}
              </button>
              <button type="button" className="btn btn-secondary btn-block" onClick={() => openCameraFor("toCode")} disabled={busy}>
                {t("scanDestinationWithCamera")}
              </button>
            </div>
          ) : (
            <button type="button" className="btn btn-secondary btn-block" onClick={() => openCameraFor("code")} disabled={busy}>
              {t("scanWithCamera")}
            </button>
          )}
        </Gate>
        <button className="btn btn-primary btn-block" onClick={handleCommit} disabled={busy} style={{ minHeight: 46 }}>
          {t(`commit${action.charAt(0).toUpperCase()}${action.slice(1)}` as "commitReceive")}
        </button>
      </div>
      {cameraOpen && <CameraScanner onDecode={handleDecode} onClose={() => setCameraOpen(false)} />}
    </div>
  );
}
