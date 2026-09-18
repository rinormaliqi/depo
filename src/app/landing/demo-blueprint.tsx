"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

// The landing page's hero is the product's core loop, live: type an item,
// the bin lights up on a small floor plan. A fixed, hand-drawn depot —
// two racks, a pallet row, a dock — drawn with the same kind styles the
// real builder uses (blueprint-canvas.tsx KIND_APPEARANCE), so what a
// visitor sees here is what they'd get. Cycles through the catalog on its
// own until the visitor types, then it's theirs.

type Kind = "zone" | "rack" | "pallets" | "dock";
type Entity = { id: string; kind: Kind; code: string; x: number; y: number; w: number; h: number; bays?: number };

// 20 × 11 grid units.
const FLOOR: Entity[] = [
  { id: "A", kind: "zone", code: "A", x: 0.5, y: 0.5, w: 12, h: 10 },
  { id: "A-01", kind: "rack", code: "A-01", x: 1.5, y: 1.5, w: 10, h: 2, bays: 6 },
  { id: "A-02", kind: "rack", code: "A-02", x: 1.5, y: 5, w: 10, h: 2, bays: 6 },
  { id: "A-03", kind: "rack", code: "A-03", x: 1.5, y: 8.5, w: 10, h: 1.5, bays: 6 },
  { id: "B", kind: "zone", code: "B", x: 13, y: 0.5, w: 6.5, h: 7 },
  { id: "B-P", kind: "pallets", code: "B-P", x: 13.75, y: 1.5, w: 5, h: 5.25, bays: 3 },
  { id: "D", kind: "dock", code: "D-1", x: 13, y: 8.5, w: 6.5, h: 2 },
];

type Item = { name: string; sku: string; bin: string; parent: string; qty: string };

const CATALOG: Record<string, Item[]> = {
  sq: [
    { name: "Profil alumini 40×40", sku: "AL-4040", bin: "A-01-3", parent: "A-01", qty: "120 copë" },
    { name: "Çimento 25 kg", sku: "CEM-25", bin: "B-P-2", parent: "B-P", qty: "40 thasë" },
    { name: "Kabllo NYM 3×2.5", sku: "NYM-325", bin: "A-02-5", parent: "A-02", qty: "300 m" },
    { name: "Vida 4×40, kuti 500", sku: "VD-440", bin: "A-01-1", parent: "A-01", qty: "18 kuti" },
    { name: "Bojë e bardhë 10 L", sku: "BJ-10W", bin: "A-03-4", parent: "A-03", qty: "22 kova" },
  ],
  en: [
    { name: "Aluminium profile 40×40", sku: "AL-4040", bin: "A-01-3", parent: "A-01", qty: "120 pcs" },
    { name: "Cement 25 kg", sku: "CEM-25", bin: "B-P-2", parent: "B-P", qty: "40 bags" },
    { name: "Cable NYM 3×2.5", sku: "NYM-325", bin: "A-02-5", parent: "A-02", qty: "300 m" },
    { name: "Screws 4×40, box of 500", sku: "VD-440", bin: "A-01-1", parent: "A-01", qty: "18 boxes" },
    { name: "White paint 10 L", sku: "BJ-10W", bin: "A-03-4", parent: "A-03", qty: "22 buckets" },
  ],
};

const KIND_STYLE: Record<Kind, React.CSSProperties> = {
  zone: { border: "1px dashed var(--color-accent-500)" },
  rack: {
    borderTop: "1px solid var(--color-accent-700)", borderBottom: "1px solid var(--color-accent-700)",
    borderLeft: "4px solid var(--color-accent-700)", borderRight: "4px solid var(--color-accent-700)",
    background: "var(--color-neutral-100)",
  },
  pallets: { border: "1px dashed var(--color-accent-500)" },
  dock: {
    border: "1px solid var(--color-accent-600)",
    background: "repeating-linear-gradient(-45deg,transparent 0 5px,color-mix(in srgb,var(--color-accent-600) 16%,transparent) 5px 6px)",
  },
};

const PALLET_BG = {
  backgroundColor: "var(--color-neutral-100)",
  backgroundImage: "linear-gradient(var(--color-neutral-400) 0 18%,transparent 18% 41%,var(--color-neutral-400) 41% 59%,transparent 59% 82%,var(--color-neutral-400) 82% 100%)",
};

export function DemoBlueprint() {
  const t = useTranslations("home.demo");
  const locale = useLocale();
  const catalog = CATALOG[locale] ?? CATALOG.en;
  const [query, setQuery] = useState("");
  const [touched, setTouched] = useState(false);
  const [cycle, setCycle] = useState(0);
  const [pulseKey, setPulseKey] = useState(0);

  useEffect(() => {
    if (touched) return;
    const id = setInterval(() => setCycle((c) => c + 1), 2800);
    return () => clearInterval(id);
  }, [touched]);

  const active: Item | null = useMemo(() => {
    if (!touched) return catalog[cycle % catalog.length];
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return catalog.find((i) => i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q)) ?? null;
  }, [touched, query, cycle, catalog]);

  // Re-arm the ping animation whenever the highlighted bin changes.
  useEffect(() => { setPulseKey((k) => k + 1); }, [active?.bin]);

  const stocked = new Set(catalog.map((i) => i.bin));
  const U = 100 / 20; // one grid unit as % of width

  return (
    <div className="blueprint lp-demo">
      <i className="corner tl" /><i className="corner tr" /><i className="corner bl" /><i className="corner br" />
      <div className="lp-demo-search">
        <label className="lp-demo-label">{t("searchLabel")}</label>
        <input
          className="input"
          type="text"
          value={touched ? query : (active?.name ?? "")}
          placeholder={t("placeholder")}
          onFocus={() => { if (!touched) { setTouched(true); setQuery(""); } }}
          onChange={(e) => { setTouched(true); setQuery(e.target.value); }}
          autoCapitalize="off" autoCorrect="off" spellCheck={false}
        />
        <div className="lp-demo-result" aria-live="polite">
          {active ? (
            <>
              <span className="lp-demo-path">A{" "}· {active.parent}{" "}· <strong>{active.bin}</strong></span>
              <span className="text-muted"> · {active.qty}</span>
            </>
          ) : touched && query.trim() ? (
            <span className="text-muted">{t("noMatch")}</span>
          ) : (
            <span className="text-muted">{t("tryOne", { example: catalog[0].name })}</span>
          )}
        </div>
      </div>

      <div className="lp-demo-floor" style={{ aspectRatio: "20 / 11" }}>
        {FLOOR.map((e) => (
          <div
            key={e.id}
            className="lp-demo-entity"
            style={{ ...KIND_STYLE[e.kind], left: `${e.x * U}%`, top: `${(e.y / 11) * 100}%`, width: `${e.w * U}%`, height: `${(e.h / 11) * 100}%` }}
          >
            <span className="lp-demo-code">{e.code}</span>
            {e.bays && (
              <div className="lp-demo-bays" style={{ gridTemplateColumns: `repeat(${e.bays}, 1fr)`, ...(e.kind === "pallets" ? { gap: 6 } : {}) }}>
                {Array.from({ length: e.bays }, (_, i) => {
                  const code = `${e.code}-${i + 1}`;
                  const hit = active?.bin === code;
                  return (
                    <div
                      key={`${code}-${hit ? pulseKey : 0}`}
                      className={hit ? "lp-demo-bay is-hit locate-ping" : stocked.has(code) ? "lp-demo-bay is-stocked" : "lp-demo-bay"}
                      style={e.kind === "pallets" ? PALLET_BG : undefined}
                      title={code}
                    >
                      {i + 1}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="lp-demo-caption text-muted">{t("caption")}</div>
    </div>
  );
}
