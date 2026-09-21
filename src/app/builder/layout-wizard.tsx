"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { LocationKind } from "@/db/schema";
import {
  buildParametric,
  DEFAULT_PARAMETRIC,
  LOCATION_TYPES,
  type ParametricLayout,
  type TemplateEntitySpec,
  type WallSide,
} from "@/lib/blueprint-types";
import { KIND_COLOR } from "./kind-appearance";

type Structure = { kind: string; xM: number; yM: number; widthM: number; heightM: number };

// A template is a fixed drawing; this asks about the real building instead —
// where the trucks dock, where people come in, how the roof is held up, how
// the storage should be divided — and generates the depot from the answers.
// Each step redraws a small preview of what "Generate" will put down, using
// the same buildParametric() the server runs, so what is previewed is what
// lands. Structure already on the floor (columns, docks…) is drawn into the
// preview too, since the server keeps and routes around it.
export function LayoutWizard({
  floor,
  structure,
  hasScheme,
  busy,
  onCancel,
  onGenerate,
}: {
  floor: { widthM: number; heightM: number };
  structure: Structure[];
  hasScheme: boolean;
  busy: boolean;
  onCancel: () => void;
  onGenerate: (layout: ParametricLayout, floor: { widthM: number; heightM: number } | null) => void;
}) {
  const t = useTranslations("builder.wizard");
  const tk = useTranslations("builder.kind");
  const [step, setStep] = useState(0);
  const [size, setSize] = useState({ widthM: String(floor.widthM), heightM: String(floor.heightM) });
  const [layout, setLayout] = useState<ParametricLayout>(DEFAULT_PARAMETRIC);
  const [pillarDraft, setPillarDraft] = useState({ spacingX: "8", spacingY: "8", size: "0.5" });

  const widthM = Math.max(6, parseFloat(size.widthM) || floor.widthM);
  const heightM = Math.max(6, parseFloat(size.heightM) || floor.heightM);
  const floorChanged = widthM !== floor.widthM || heightM !== floor.heightM;

  const kept = useMemo(() => structure.filter((s) => LOCATION_TYPES[s.kind as LocationKind]?.spatial === "fixture"), [structure]);
  const preview = useMemo(
    () =>
      buildParametric(layout, widthM, heightM, {
        hasWalls: kept.some((s) => s.kind === "wall"),
        obstacles: kept.filter((s) => s.kind !== "wall"),
      }),
    [layout, widthM, heightM, kept],
  );
  const count = (kind: LocationKind) => preview.filter((s) => s.kind === kind).length;
  const bins = preview.filter((s) => LOCATION_TYPES[s.kind].spatial === "store").reduce((n, s) => n + s.bays * s.levels, 0);

  const steps = ["floor", "access", "structure", "storage", "review"] as const;
  const last = step === steps.length - 1;

  function setPillars(on: boolean) {
    setLayout((l) => ({
      ...l,
      pillars: on
        ? { spacingX: parseFloat(pillarDraft.spacingX) || 8, spacingY: parseFloat(pillarDraft.spacingY) || 8, size: parseFloat(pillarDraft.size) || 0.5 }
        : null,
    }));
  }
  function updatePillars(patch: Partial<typeof pillarDraft>) {
    const next = { ...pillarDraft, ...patch };
    setPillarDraft(next);
    if (layout.pillars) {
      setLayout((l) => ({ ...l, pillars: { spacingX: parseFloat(next.spacingX) || 8, spacingY: parseFloat(next.spacingY) || 8, size: parseFloat(next.size) || 0.5 } }));
    }
  }

  const heading: React.CSSProperties = { fontFamily: "var(--font-heading)", fontSize: 11, letterSpacing: ".16em", textTransform: "uppercase", color: "color-mix(in srgb,var(--color-text) 55%,transparent)" };
  const seg = (value: string, options: { key: string; label: string }[], onPick: (k: string) => void) => (
    <div className="seg" role="radiogroup" style={{ flexWrap: "wrap" }}>
      {options.map((o) => (
        <button key={o.key} type="button" className="seg-opt" role="radio" aria-checked={value === o.key} onClick={() => onPick(o.key)}
          style={{ background: value === o.key ? "var(--color-accent)" : undefined, color: value === o.key ? "var(--color-bg)" : undefined, fontSize: 11 }}>
          {o.label}
        </button>
      ))}
    </div>
  );
  const walls: { key: WallSide; label: string }[] = (["top", "bottom", "left", "right"] as WallSide[]).map((w) => ({ key: w, label: t(`wall.${w}`) }));

  return (
    <div className="dialog-backdrop" style={{ position: "fixed", zIndex: 60 }} onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="dialog blueprint" style={{ maxWidth: 720, width: "min(720px, calc(100vw - 32px))" }}>
        <i className="corner tl" /><i className="corner tr" /><i className="corner bl" /><i className="corner br" />
        <div className="dialog-title">{t("title")}</div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: "color-mix(in srgb,var(--color-text) 55%,transparent)" }}>
          {steps.map((s, i) => (
            <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 18, height: 18, borderRadius: 9, display: "inline-grid", placeItems: "center", fontSize: 10, background: i <= step ? "var(--color-accent)" : "var(--color-neutral-200)", color: i <= step ? "var(--color-bg)" : undefined }}>{i + 1}</span>
              {i === step && <span style={{ color: "var(--color-text)" }}>{t(`step.${s}`)}</span>}
            </span>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 18, alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
            {step === 0 && (
              <>
                <div className="dialog-body">{t("floor.body")}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div className="field"><label>{t("floor.width")}</label><input className="input" type="number" step="0.5" min="6" value={size.widthM} onChange={(e) => setSize((s) => ({ ...s, widthM: e.target.value }))} /></div>
                  <div className="field"><label>{t("floor.depth")}</label><input className="input" type="number" step="0.5" min="6" value={size.heightM} onChange={(e) => setSize((s) => ({ ...s, heightM: e.target.value }))} /></div>
                </div>
                <label className="radio" style={{ fontSize: 13 }}>
                  <input type="checkbox" checked={layout.walls} onChange={(e) => setLayout((l) => ({ ...l, walls: e.target.checked }))} /><span className="dot" />
                  {t("floor.walls")}
                </label>
              </>
            )}
            {step === 1 && (
              <>
                <div className="dialog-body">{t("access.body")}</div>
                <div style={heading}>{t("access.docks")}</div>
                <div style={{ display: "grid", gridTemplateColumns: "88px 1fr", gap: 8, alignItems: "end" }}>
                  <div className="field"><label>{t("access.dockCount")}</label><input className="input" type="number" step="1" min="0" max="12" value={layout.docks.count} onChange={(e) => setLayout((l) => ({ ...l, docks: { ...l.docks, count: Math.max(0, parseInt(e.target.value, 10) || 0) } }))} /></div>
                  <div className="field"><label>{t("access.dockWall")}</label>{seg(layout.docks.wall, walls, (k) => setLayout((l) => ({ ...l, docks: { ...l.docks, wall: k as WallSide } })))}</div>
                </div>
                <div style={heading}>{t("access.entrance")}</div>
                <label className="radio" style={{ fontSize: 13 }}>
                  <input type="checkbox" checked={!!layout.entrance} onChange={(e) => setLayout((l) => ({ ...l, entrance: e.target.checked ? { wall: "left", at: "middle" } : null }))} /><span className="dot" />
                  {t("access.hasEntrance")}
                </label>
                {layout.entrance && (
                  <div style={{ display: "grid", gap: 8 }}>
                    <div className="field"><label>{t("access.entranceWall")}</label>{seg(layout.entrance.wall, walls, (k) => setLayout((l) => ({ ...l, entrance: l.entrance && { ...l.entrance, wall: k as WallSide } })))}</div>
                    <div className="field"><label>{t("access.entranceAt")}</label>{seg(layout.entrance.at, (["start", "middle", "end"] as const).map((a) => ({ key: a, label: t(`at.${a}`) })), (k) => setLayout((l) => ({ ...l, entrance: l.entrance && { ...l.entrance, at: k as "start" | "middle" | "end" } })))}</div>
                  </div>
                )}
              </>
            )}
            {step === 2 && (
              <>
                <div className="dialog-body">{t("structure.body")}</div>
                <label className="radio" style={{ fontSize: 13 }}>
                  <input type="checkbox" checked={!!layout.pillars} onChange={(e) => setPillars(e.target.checked)} /><span className="dot" />
                  {t("structure.hasPillars")}
                </label>
                {layout.pillars && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                    <div className="field"><label>{t("structure.spacingX")}</label><input className="input" type="number" step="0.5" min="2" value={pillarDraft.spacingX} onChange={(e) => updatePillars({ spacingX: e.target.value })} /></div>
                    <div className="field"><label>{t("structure.spacingY")}</label><input className="input" type="number" step="0.5" min="2" value={pillarDraft.spacingY} onChange={(e) => updatePillars({ spacingY: e.target.value })} /></div>
                    <div className="field"><label>{t("structure.size")}</label><input className="input" type="number" step="0.1" min="0.2" value={pillarDraft.size} onChange={(e) => updatePillars({ size: e.target.value })} /></div>
                  </div>
                )}
                {kept.length > 0 && <div style={{ fontSize: 12, color: "color-mix(in srgb,var(--color-text) 65%,transparent)" }}>{t("structure.kept", { n: kept.length })}</div>}
              </>
            )}
            {step === 3 && (
              <>
                <div className="dialog-body">{t("storage.body")}</div>
                <div style={{ display: "grid", gridTemplateColumns: "88px 1fr", gap: 8, alignItems: "end" }}>
                  <div className="field"><label>{t("storage.zones")}</label><input className="input" type="number" step="1" min="1" max="12" value={layout.zones} onChange={(e) => setLayout((l) => ({ ...l, zones: Math.min(12, Math.max(1, parseInt(e.target.value, 10) || 1)) }))} /></div>
                  <div className="field"><label>{t("storage.orientation")}</label>{seg(layout.orientation, [{ key: "vertical", label: t("storage.vertical") }, { key: "horizontal", label: t("storage.horizontal") }], (k) => setLayout((l) => ({ ...l, orientation: k as "vertical" | "horizontal" })))}</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div className="field"><label>{t("storage.levels")}</label><input className="input" type="number" step="1" min="1" max="4" value={layout.levels} onChange={(e) => setLayout((l) => ({ ...l, levels: Math.min(4, Math.max(1, parseInt(e.target.value, 10) || 1)) }))} /></div>
                  <div className="field"><label>{t("storage.bays")}</label><input className="input" type="number" step="1" min="1" max="48" value={layout.bays} onChange={(e) => setLayout((l) => ({ ...l, bays: Math.min(48, Math.max(1, parseInt(e.target.value, 10) || 1)) }))} /></div>
                </div>
              </>
            )}
            {step === 4 && (
              <>
                <div className="dialog-body">{hasScheme ? t("review.replaceBody") : t("review.body")}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", rowGap: 5, columnGap: 12, fontSize: 13 }}>
                  {(["zone", "rack", "dock", "door", "pillar"] as LocationKind[]).filter((k) => count(k) > 0).map((k) => (
                    <div key={k} style={{ display: "contents" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><span style={{ width: 12, height: 12, background: KIND_COLOR[k], flex: "none" }} />{tk(k)}</span>
                      <span style={{ fontVariantNumeric: "tabular-nums", textAlign: "right" }}>{count(k)}</span>
                    </div>
                  ))}
                  <span>{t("review.bins")}</span><span style={{ fontVariantNumeric: "tabular-nums", textAlign: "right" }}>{bins}</span>
                  {floorChanged && <><span>{t("review.floor")}</span><span style={{ textAlign: "right" }}>{widthM} × {heightM} m</span></>}
                </div>
              </>
            )}
          </div>

          <Preview widthM={widthM} heightM={heightM} specs={preview} kept={kept} />
        </div>

        <div className="dialog-actions">
          <button className="btn btn-secondary" onClick={step === 0 ? onCancel : () => setStep((s) => s - 1)} disabled={busy}>{step === 0 ? t("cancel") : t("back")}</button>
          <span style={{ flex: 1 }} />
          {!last && <button className="btn btn-primary" onClick={() => setStep((s) => s + 1)}>{t("next")}</button>}
          {last && (
            <button className="btn btn-primary" onClick={() => onGenerate(layout, floorChanged ? { widthM, heightM } : null)} disabled={busy}>
              {hasScheme ? t("review.replace") : t("review.generate")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// The floor as it would be generated, drawn to scale in the kinds' colours.
function Preview({ widthM, heightM, specs, kept }: { widthM: number; heightM: number; specs: TemplateEntitySpec[]; kept: Structure[] }) {
  const t = useTranslations("builder.wizard");
  const all = [...kept.map((k) => ({ ...k, kind: k.kind as LocationKind })), ...specs];
  const order = (k: LocationKind) => (LOCATION_TYPES[k].spatial === "area" ? 0 : LOCATION_TYPES[k].spatial === "fixture" ? 1 : 2);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
      <div style={{ fontFamily: "var(--font-heading)", fontSize: 11, letterSpacing: ".16em", textTransform: "uppercase", color: "color-mix(in srgb,var(--color-text) 55%,transparent)" }}>{t("preview")}</div>
      <svg viewBox={`0 0 ${widthM} ${heightM}`} style={{ width: "100%", height: "auto", background: "#fff", border: "1px solid var(--color-accent-900)", display: "block" }} aria-hidden>
        {all
          .sort((a, b) => order(a.kind) - order(b.kind))
          .map((s, i) => {
            const kind = s.kind;
            const type = LOCATION_TYPES[kind];
            const color = KIND_COLOR[kind];
            const area = type.spatial === "area";
            return (
              <rect
                key={i}
                x={s.xM} y={s.yM} width={s.widthM} height={s.heightM}
                fill={area ? "none" : kind === "wall" || kind === "pillar" ? color : `color-mix(in srgb,${color} 35%,#fff)`}
                stroke={color}
                strokeWidth={area ? 0.08 : 0.05}
                strokeDasharray={area ? "0.4 0.25" : undefined}
              />
            );
          })}
      </svg>
      <div style={{ fontSize: 11, color: "color-mix(in srgb,var(--color-text) 55%,transparent)" }}>{widthM} × {heightM} m</div>
    </div>
  );
}
