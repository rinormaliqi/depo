"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useNotify } from "@/components/notifications";
import { UNDERLAY_MAX_BYTES, underlayUrl, type UnderlayMeta } from "@/lib/underlay-shared";
import * as rawActions from "./actions";
import { unwrap } from "@/lib/action-result";

const updateUnderlay = unwrap(rawActions.updateUnderlay);
const removeUnderlay = unwrap(rawActions.removeUnderlay);

// Longest side an uploaded drawing is kept at. Plenty to trace a wall from,
// and it keeps a phone photo or an A0 scan under the 4 MB cap.
const MAX_SIDE_PX = 2500;

// Turns whatever the user picked into an image the server accepts: a PDF's
// first page is rasterised here (pdf.js in the browser, so the server never
// parses PDFs), an oversized photo is downscaled, a small PNG/JPEG/WebP is
// sent as-is.
async function toUploadable(file: File): Promise<{ blob: Blob; widthPx: number; heightPx: number }> {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = MAX_SIDE_PX / Math.max(base.width, base.height);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("render"))), "image/png"));
    return { blob, widthPx: canvas.width, heightPx: canvas.height };
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("decode"));
      i.src = url;
    });
    const longest = Math.max(img.naturalWidth, img.naturalHeight);
    if (longest <= MAX_SIDE_PX && file.size <= UNDERLAY_MAX_BYTES && ["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      return { blob: file, widthPx: img.naturalWidth, heightPx: img.naturalHeight };
    }
    const k = Math.min(1, MAX_SIDE_PX / longest);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * k);
    canvas.height = Math.round(img.naturalHeight * k);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("encode"))), "image/jpeg", 0.9));
    return { blob, widthPx: canvas.width, heightPx: canvas.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export type Calibration = { points: { x: number; y: number }[] };

export function UnderlayPanel({
  facilityId,
  underlay,
  readOnly,
  busy,
  calibration,
  onStartCalibration,
  onCancelCalibration,
  onCalibrated,
  onChanged,
}: {
  facilityId: string;
  underlay: UnderlayMeta | null;
  readOnly: boolean;
  busy: boolean;
  calibration: Calibration | null;
  onStartCalibration: () => void;
  onCancelCalibration: () => void;
  onCalibrated: (distanceM: number) => Promise<void>;
  onChanged: () => Promise<void>;
}) {
  const t = useTranslations("builder.underlay");
  const notify = useNotify();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [distance, setDistance] = useState("");

  async function upload(file: File) {
    setUploading(true);
    try {
      const { blob, widthPx, heightPx } = await toUploadable(file);
      if (blob.size > UNDERLAY_MAX_BYTES) throw new Error(t("tooLarge"));
      const form = new FormData();
      form.set("file", blob, "underlay");
      form.set("widthPx", String(widthPx));
      form.set("heightPx", String(heightPx));
      const res = await fetch(underlayUrl(facilityId, 0).split("?")[0], { method: "POST", body: form });
      if (!res.ok) throw new Error(t("uploadFailed"));
      await onChanged();
      notify.success(t("uploaded"));
    } catch (e) {
      notify.error(e instanceof Error && e.message ? e.message : t("uploadFailed"));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function patch(p: Parameters<typeof updateUnderlay>[1]) {
    try {
      await updateUnderlay(facilityId, p);
      await onChanged();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : t("uploadFailed"));
    }
  }

  const heading: React.CSSProperties = { fontFamily: "var(--font-heading)", fontSize: 11, letterSpacing: ".16em", textTransform: "uppercase", color: "color-mix(in srgb,var(--color-text) 55%,transparent)" };
  const disabled = busy || uploading;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={heading}>{t("title")}</div>
      {!underlay && <div style={{ fontSize: 11, lineHeight: 1.45, color: "color-mix(in srgb,var(--color-text) 60%,transparent)" }}>{t("empty")}</div>}

      {!readOnly && (
        <>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
          <button className="btn btn-secondary btn-block" onClick={() => fileRef.current?.click()} disabled={disabled}>
            {uploading ? t("uploading") : underlay ? t("replace") : t("upload")}
          </button>
        </>
      )}

      {underlay && (
        <>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
            <span style={{ width: 64, color: "color-mix(in srgb,var(--color-text) 60%,transparent)" }}>{t("opacity")}</span>
            <input type="range" min={5} max={100} step={5} value={Math.round(underlay.opacity * 100)} disabled={readOnly || disabled}
              onChange={(e) => void patch({ opacity: Number(e.target.value) / 100 })} style={{ flex: 1 }} />
          </label>
          <label className="radio" style={{ fontSize: 12 }}>
            <input type="checkbox" checked={underlay.visible} disabled={readOnly || disabled} onChange={(e) => void patch({ visible: e.target.checked })} /><span className="dot" />
            {t("visible")}
          </label>
          <div style={{ fontSize: 11, color: "color-mix(in srgb,var(--color-text) 60%,transparent)", fontVariantNumeric: "tabular-nums" }}>
            {t("scaleInfo", { cm: (underlay.scale * 100).toFixed(2), w: (underlay.widthPx * underlay.scale).toFixed(1), h: (underlay.heightPx * underlay.scale).toFixed(1) })}
          </div>

          {!readOnly && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div className="field"><label>{t("offsetX")}</label><input className="input" type="number" step="0.1" defaultValue={underlay.offsetXM} key={`x${underlay.version}`} disabled={disabled} onBlur={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v !== underlay.offsetXM) void patch({ offsetXM: v }); }} /></div>
                <div className="field"><label>{t("offsetY")}</label><input className="input" type="number" step="0.1" defaultValue={underlay.offsetYM} key={`y${underlay.version}`} disabled={disabled} onBlur={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v !== underlay.offsetYM) void patch({ offsetYM: v }); }} /></div>
              </div>

              {!calibration ? (
                <button className="btn btn-secondary btn-block" onClick={onStartCalibration} disabled={disabled} title={t("calibrateHint")}>{t("calibrate")}</button>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: 8, border: "1px dashed var(--color-accent)", fontSize: 12 }}>
                  <div>{calibration.points.length < 2 ? t(calibration.points.length === 0 ? "clickFirst" : "clickSecond") : t("enterDistance")}</div>
                  {calibration.points.length === 2 && (
                    <div style={{ display: "flex", gap: 6 }}>
                      <input className="input" type="number" step="0.01" min="0.01" placeholder="m" value={distance} onChange={(e) => setDistance(e.target.value)} autoFocus style={{ flex: 1 }} />
                      <button className="btn btn-primary" disabled={disabled || !(parseFloat(distance) > 0)} onClick={async () => { await onCalibrated(parseFloat(distance)); setDistance(""); }}>{t("apply")}</button>
                    </div>
                  )}
                  <button className="btn btn-ghost" onClick={() => { onCancelCalibration(); setDistance(""); }} style={{ alignSelf: "flex-start", fontSize: 11 }}>{t("cancel")}</button>
                </div>
              )}

              <button className="btn btn-ghost" style={{ color: "var(--color-danger-700)", alignSelf: "flex-start", fontSize: 11 }} disabled={disabled}
                onClick={async () => { try { await removeUnderlay(facilityId); await onChanged(); } catch (e) { notify.error(e instanceof Error ? e.message : t("uploadFailed")); } }}>
                {t("remove")}
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
