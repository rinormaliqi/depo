"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LocationKind } from "@/db/schema";
import { LOCATION_TYPES } from "@/lib/blueprint-types";
import {
  createEntity,
  deleteEntity,
  duplicateEntity,
  getBlueprint,
  updateEntity,
  updateFacility,
  type LocationRow,
} from "./actions";

const PPM = 26;
type Facility = { id: string; name: string; widthM: number; heightM: number };

const PALETTE: { kind: LocationKind; hint: string }[] = [
  { kind: "zone", hint: "area" },
  { kind: "aisle", hint: "circulation" },
  { kind: "rack", hint: "3 bays default" },
  { kind: "platform", hint: "4 bays default" },
  { kind: "pallet", hint: "1 slot" },
  { kind: "bin", hint: "1 slot" },
  { kind: "dock", hint: "fixture" },
  { kind: "wall", hint: "fixture" },
];

function defaultPosition(count: number) {
  return { x: 1 + (count % 8) * 1.5, y: 1 + Math.floor(count / 8) * 1.5 };
}

function occupancyOf(entity: LocationRow, all: LocationRow[], occupied: Set<string>) {
  if (entity.bays <= 1) return occupied.has(entity.id) ? 1 : 0;
  const kids = all.filter((l) => l.parentId === entity.id);
  if (kids.length === 0) return 0;
  return kids.filter((k) => occupied.has(k.id)).length / kids.length;
}

export function BlueprintCanvas({
  facility: initialFacility,
  initialLocations,
  initialOccupiedBinIds,
}: {
  facility: Facility;
  initialLocations: LocationRow[];
  initialOccupiedBinIds: string[];
}) {
  const [facility, setFacility] = useState(initialFacility);
  const [locations, setLocations] = useState(initialLocations);
  const [occupied, setOccupied] = useState(new Set(initialOccupiedBinIds));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0.8);
  const [grid, setGrid] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [floorOpen, setFloorOpen] = useState(false);
  const [floorDraft, setFloorDraft] = useState({
    name: facility.name,
    widthM: String(facility.widthM),
    heightM: String(facility.heightM),
  });

  const wrapRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => locations.find((l) => l.id === selectedId) ?? null,
    [locations, selectedId],
  );

  useEffect(() => {
    if (!selected) return;
    setDraft({
      name: selected.name,
      code: selected.code ?? "",
      xM: String(selected.xM),
      yM: String(selected.yM),
      widthM: String(selected.widthM),
      heightM: String(selected.heightM),
      bays: String(selected.bays),
    });
  }, [selected]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const w = el.clientWidth - 62;
    const h = el.clientHeight - 58;
    if (w < 80 || h < 80) return;
    const z = Math.min(w / (facility.widthM * PPM), h / (facility.heightM * PPM));
    setZoom(Math.max(0.3, Math.min(2, Math.round(z * 20) / 20)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function fit() {
    const el = wrapRef.current;
    if (!el) return;
    const w = el.clientWidth - 62;
    const h = el.clientHeight - 58;
    if (w < 80 || h < 80) return;
    const z = Math.min(w / (facility.widthM * PPM), h / (facility.heightM * PPM));
    setZoom(Math.max(0.3, Math.min(2, Math.round(z * 20) / 20)));
  }

  async function reload() {
    const data = await getBlueprint(facility.id);
    setLocations(data.locations);
    setOccupied(new Set(data.occupiedBinIds));
  }

  async function handleAdd(kind: LocationKind) {
    setBusy(true);
    setError(null);
    try {
      const pos = defaultPosition(locations.length);
      const created = await createEntity(facility.id, kind, pos.x, pos.y);
      await reload();
      setSelectedId(created.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add that");
    } finally {
      setBusy(false);
    }
  }

  async function commit(patch: Record<string, string | number>) {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await updateEntity(selected.id, patch);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that change");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await deleteEntity(selected.id);
      setSelectedId(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete that");
    } finally {
      setBusy(false);
    }
  }

  async function handleDuplicate() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const copy = await duplicateEntity(selected.id);
      await reload();
      setSelectedId(copy.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't duplicate that");
    } finally {
      setBusy(false);
    }
  }

  async function handleFloorSave() {
    setBusy(true);
    setError(null);
    try {
      await updateFacility(facility.id, {
        name: floorDraft.name,
        widthM: parseFloat(floorDraft.widthM) || facility.widthM,
        heightM: parseFloat(floorDraft.heightM) || facility.heightM,
      });
      setFacility((f) => ({
        ...f,
        name: floorDraft.name,
        widthM: parseFloat(floorDraft.widthM) || f.widthM,
        heightM: parseFloat(floorDraft.heightM) || f.heightM,
      }));
      setFloorOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the floor");
    } finally {
      setBusy(false);
    }
  }

  const z = zoom * PPM;
  const topLevel = locations.filter((l) => {
    if (!l.parentId) return true;
    const parent = locations.find((p) => p.id === l.parentId);
    return parent?.kind === "zone";
  });
  const composition = Object.keys(LOCATION_TYPES).map((k) => ({
    kind: k,
    label: LOCATION_TYPES[k as LocationKind].label + "s",
    n: locations.filter((l) => l.kind === k).length,
  })).filter((c) => c.n > 0);

  return (
    <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "minmax(0,214px) minmax(480px,1fr) minmax(0,306px)" }}>
      <div style={{ borderRight: "1px solid var(--color-divider)", background: "#fff", overflow: "auto", padding: 13 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 11, letterSpacing: ".16em", textTransform: "uppercase", color: "color-mix(in srgb,var(--color-text) 55%,transparent)" }}>
            Entities
          </div>
          <div style={{ fontSize: 11, lineHeight: 1.45, color: "color-mix(in srgb,var(--color-text) 60%,transparent)", marginBottom: 3 }}>
            Click to drop onto the floor, then position it exactly on the right.
          </div>

          {PALETTE.map(({ kind, hint }) => {
            const t = LOCATION_TYPES[kind];
            return (
              <button
                key={kind}
                onClick={() => handleAdd(kind)}
                disabled={busy}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "7px 8px",
                  border: "1px solid var(--color-divider)", background: "#fff", cursor: "pointer",
                  textAlign: "left", font: "inherit",
                }}
              >
                <div style={{ width: 24, height: 20, flex: "none", border: "1px dashed var(--color-accent-500)" }} />
                <div>
                  <div style={{ fontFamily: "var(--font-heading)", fontSize: 14, letterSpacing: ".04em" }}>{t.label.toUpperCase()}</div>
                  <div style={{ fontSize: 10, color: "color-mix(in srgb,var(--color-text) 50%,transparent)" }}>
                    {t.w.toFixed(1)} × {t.h.toFixed(1)} m · {hint}
                  </div>
                </div>
              </button>
            );
          })}

          <div style={{ height: 1, background: "var(--color-divider)", margin: "9px 0" }} />
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 11, letterSpacing: ".16em", textTransform: "uppercase", color: "color-mix(in srgb,var(--color-text) 55%,transparent)" }}>
            Floor
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "color-mix(in srgb,var(--color-text) 60%,transparent)" }}>Objects</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{topLevel.length}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "color-mix(in srgb,var(--color-text) 60%,transparent)" }}>Envelope</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{facility.widthM} × {facility.heightM} m</span>
            </div>
          </div>
          <button className="btn btn-secondary btn-block" onClick={() => setFloorOpen(true)}>Edit floor</button>
        </div>
      </div>

      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", background: "var(--color-bg)" }}>
        <div style={{ flex: "none", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 7, padding: "7px 11px", background: "#fff", borderBottom: "1px solid var(--color-divider)" }}>
          <button className="btn btn-secondary" onClick={() => setZoom((z) => Math.max(0.2, Math.round((z - 0.1) * 10) / 10))} style={{ minWidth: 26, padding: "1px 7px" }}>−</button>
          <span style={{ fontSize: 11, fontVariantNumeric: "tabular-nums", minWidth: 36, textAlign: "center" }}>{Math.round(zoom * 100)}%</span>
          <button className="btn btn-secondary" onClick={() => setZoom((z) => Math.min(2, Math.round((z + 0.1) * 10) / 10))} style={{ minWidth: 26, padding: "1px 7px" }}>+</button>
          <button className="btn btn-secondary" onClick={fit} style={{ padding: "1px 8px", fontSize: 11, letterSpacing: ".08em" }}>FIT</button>
          <button className="btn btn-ghost" onClick={() => setGrid((g) => !g)} style={{ fontSize: 11, letterSpacing: ".08em" }}>{grid ? "GRID ON" : "GRID OFF"}</button>
          {error && <span style={{ fontSize: 11, color: "var(--color-accent-800)", marginLeft: 8 }}>{error}</span>}
        </div>

        <div ref={wrapRef} style={{ flex: 1, minHeight: 0, position: "relative", overflow: "auto" }} onMouseDown={(e) => { if (e.target === e.currentTarget) setSelectedId(null); }}>
          <div style={{ display: "inline-block", padding: "30px 22px 22px 34px", position: "relative" }}>
            <div
              style={{
                position: "relative", width: facility.widthM * z, height: facility.heightM * z,
                background: "#fff", border: "1.5px solid var(--color-accent-900)", boxShadow: "var(--shadow-md)",
                backgroundImage: grid
                  ? "linear-gradient(to right,var(--color-accent-100) 0 1px,transparent 1px),linear-gradient(to bottom,var(--color-accent-100) 0 1px,transparent 1px)"
                  : undefined,
                backgroundSize: grid ? `${z}px ${z}px,${z}px ${z}px` : undefined,
              }}
              onMouseDown={(e) => { if (e.target === e.currentTarget) setSelectedId(null); }}
            >
              {topLevel.length === 0 && (
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, textAlign: "center", pointerEvents: "none", padding: 20 }}>
                  <div style={{ fontFamily: "var(--font-heading)", fontSize: 21, letterSpacing: ".08em", color: "var(--color-accent-700)" }}>EMPTY FLOOR</div>
                  <div style={{ fontSize: 13, maxWidth: 320, color: "color-mix(in srgb,var(--color-text) 60%,transparent)" }}>
                    Add a zone from the palette to block out your first section, then fill it with racks, platforms and pallet positions.
                  </div>
                </div>
              )}
              {topLevel.map((e) => {
                const t = LOCATION_TYPES[e.kind as LocationKind];
                const isSel = e.id === selectedId;
                const box: React.CSSProperties = {
                  position: "absolute", left: e.xM * z, top: e.yM * z, width: e.widthM * z, height: e.heightM * z,
                  cursor: "pointer",
                };
                if (t.spatial === "area") {
                  box.border = "1px dashed var(--color-accent-500)";
                  box.background = e.kind === "aisle"
                    ? "repeating-linear-gradient(45deg,transparent 0 7px,color-mix(in srgb,var(--color-text) 5%,transparent) 7px 8px)"
                    : "transparent";
                  box.zIndex = 1;
                } else if (t.spatial === "fixture") {
                  box.border = "1px solid var(--color-neutral-500)";
                  box.background = "repeating-linear-gradient(-45deg,transparent 0 5px,var(--color-neutral-300) 5px 6px)";
                  box.zIndex = 2;
                } else {
                  box.border = "1px solid var(--color-accent-700)";
                  box.background = "#fff";
                  box.zIndex = 3;
                }
                if (isSel) { box.outline = "1.5px solid var(--color-accent)"; box.outlineOffset = 1; box.zIndex = 6; }

                const kids = t.spatial === "store" && e.bays > 1
                  ? locations.filter((l) => l.parentId === e.id).sort((a, b) => (a.code ?? "").localeCompare(b.code ?? ""))
                  : [];

                return (
                  <div key={e.id} style={box} onMouseDown={(ev) => { ev.stopPropagation(); setSelectedId(e.id); }} title={`${e.code ?? e.name} · ${e.name}`}>
                    <div
                      onMouseDown={(ev) => { ev.stopPropagation(); setSelectedId(e.id); }}
                      style={{
                        position: "absolute", left: 0, top: -3, transform: "translateY(-100%)",
                        fontFamily: "var(--font-heading)", fontSize: t.spatial === "area" ? 11 : 9,
                        letterSpacing: t.spatial === "area" ? ".14em" : ".1em", whiteSpace: "nowrap",
                        color: t.spatial === "area" ? "var(--color-accent-700)" : "color-mix(in srgb,var(--color-text) 62%,transparent)",
                        cursor: "pointer",
                      }}
                    >
                      {e.kind === "zone" ? `${e.code} · ${e.name}` : (t.spatial === "fixture" ? e.name : e.code)}
                    </div>

                    {kids.length > 0 ? (
                      <div style={{ display: "grid", gridTemplateColumns: `repeat(${kids.length},minmax(0,1fr))`, gap: 1, padding: 1, width: "100%", height: "100%" }}>
                        {kids.map((k) => {
                          const isOcc = occupied.has(k.id);
                          return (
                            <Link
                              key={k.id}
                              href={`/builder/bin/${k.id}`}
                              onMouseDown={(ev) => ev.stopPropagation()}
                              title={`${k.code} — ${isOcc ? "stocked" : "empty"}`}
                              style={{
                                border: "1px solid var(--color-neutral-300)",
                                background: isOcc ? "var(--color-accent-200)" : "#fff",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: 8, color: "color-mix(in srgb,var(--color-text) 55%,transparent)",
                                minWidth: 0, overflow: "hidden", textDecoration: "none",
                              }}
                            />
                          );
                        })}
                      </div>
                    ) : t.spatial === "store" && e.isBin ? (
                      <Link
                        href={`/builder/bin/${e.id}`}
                        onMouseDown={(ev) => ev.stopPropagation()}
                        style={{ display: "block", width: "100%", height: "100%", background: occupied.has(e.id) ? "var(--color-accent-200)" : undefined }}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div style={{ borderLeft: "1px solid var(--color-divider)", background: "#fff", overflow: "auto", padding: 14 }}>
        {selected ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
              <div>
                <div style={{ fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--color-accent)" }}>
                  {LOCATION_TYPES[selected.kind as LocationKind].label}
                </div>
                <div style={{ fontFamily: "var(--font-heading)", fontSize: 24, letterSpacing: ".03em", lineHeight: 1.05 }}>
                  {selected.code}
                </div>
              </div>
              <span className="tag tag-accent">
                {selected.bays > 1 ? `${selected.bays} bays` : selected.isBin ? "1 location" : `${Math.round(selected.widthM * selected.heightM)} m²`}
              </span>
            </div>

            <div className="field">
              <label>Label</label>
              <input className="input" type="text" value={draft.name ?? ""} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} onBlur={() => commit({ name: draft.name })} />
            </div>
            <div className="field">
              <label>Location code</label>
              <input className="input" type="text" value={draft.code ?? ""} onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value }))} onBlur={() => commit({ code: draft.code })} />
            </div>

            <div>
              <div style={{ fontFamily: "var(--font-heading)", fontSize: 11, letterSpacing: ".16em", textTransform: "uppercase", color: "color-mix(in srgb,var(--color-text) 55%,transparent)", marginBottom: 7 }}>
                Dimensions · metres
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div className="field"><label>Width</label><input className="input" type="number" step="0.1" min="0.3" value={draft.widthM ?? ""} onChange={(e) => setDraft((d) => ({ ...d, widthM: e.target.value }))} onBlur={() => commit({ widthM: parseFloat(draft.widthM) })} /></div>
                <div className="field"><label>Depth</label><input className="input" type="number" step="0.1" min="0.3" value={draft.heightM ?? ""} onChange={(e) => setDraft((d) => ({ ...d, heightM: e.target.value }))} onBlur={() => commit({ heightM: parseFloat(draft.heightM) })} /></div>
                <div className="field"><label>X from wall</label><input className="input" type="number" step="0.1" min="0" value={draft.xM ?? ""} onChange={(e) => setDraft((d) => ({ ...d, xM: e.target.value }))} onBlur={() => commit({ xM: parseFloat(draft.xM) })} /></div>
                <div className="field"><label>Y from wall</label><input className="input" type="number" step="0.1" min="0" value={draft.yM ?? ""} onChange={(e) => setDraft((d) => ({ ...d, yM: e.target.value }))} onBlur={() => commit({ yM: parseFloat(draft.yM) })} /></div>
              </div>
            </div>

            {LOCATION_TYPES[selected.kind as LocationKind].spatial === "store" && (
              <div>
                <div style={{ fontFamily: "var(--font-heading)", fontSize: 11, letterSpacing: ".16em", textTransform: "uppercase", color: "color-mix(in srgb,var(--color-text) 55%,transparent)", marginBottom: 7 }}>
                  Subdivision
                </div>
                <div className="field"><label>Bays</label><input className="input" type="number" step="1" min="1" max="48" value={draft.bays ?? ""} onChange={(e) => setDraft((d) => ({ ...d, bays: e.target.value }))} onBlur={() => commit({ bays: parseInt(draft.bays, 10) })} /></div>
                <div style={{ marginTop: 9, display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11 }}>
                  <span style={{ color: "color-mix(in srgb,var(--color-text) 60%,transparent)" }}>Occupied</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>{Math.round(occupancyOf(selected, locations, occupied) * 100)}%</span>
                </div>
                <div style={{ marginTop: 5, height: 6, background: "var(--color-neutral-200)" }}>
                  <div style={{ width: `${Math.round(occupancyOf(selected, locations, occupied) * 100)}%`, height: "100%", background: "var(--color-accent)" }} />
                </div>
                {selected.isBin && (
                  <Link href={`/builder/bin/${selected.id}`} className="btn btn-secondary btn-block" style={{ marginTop: 9 }}>
                    View stock
                  </Link>
                )}
              </div>
            )}

            {error && <p style={{ fontSize: 12, color: "var(--color-accent-800)" }}>{error}</p>}

            <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
              <button className="btn btn-secondary" onClick={handleDuplicate} disabled={busy} style={{ flex: 1 }}>Duplicate</button>
              <button className="btn btn-secondary" onClick={handleDelete} disabled={busy} style={{ flex: 1 }}>Delete</button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 11, letterSpacing: ".16em", textTransform: "uppercase", color: "color-mix(in srgb,var(--color-text) 55%,transparent)" }}>
              Nothing selected
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.5, color: "color-mix(in srgb,var(--color-text) 72%,transparent)" }}>
              Click an object on the floor to edit its dimensions, its code and how many bays it&apos;s split into.
            </div>
            <div style={{ height: 1, background: "var(--color-divider)" }} />
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 11, letterSpacing: ".16em", textTransform: "uppercase", color: "color-mix(in srgb,var(--color-text) 55%,transparent)" }}>
              Composition
            </div>
            {composition.map((c) => (
              <div key={c.kind} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, paddingBottom: 6, borderBottom: "1px solid color-mix(in srgb,var(--color-text) 8%,transparent)" }}>
                <span style={{ fontSize: 13 }}>{c.label}</span>
                <span style={{ fontFamily: "var(--font-heading)", fontSize: 16, fontVariantNumeric: "tabular-nums" }}>{c.n}</span>
              </div>
            ))}
            {error && <p style={{ fontSize: 12, color: "var(--color-accent-800)" }}>{error}</p>}
          </div>
        )}
      </div>

      {floorOpen && (
        <div className="dialog-backdrop" style={{ position: "fixed", zIndex: 60 }}>
          <div className="dialog blueprint">
            <i className="corner tl" /><i className="corner tr" /><i className="corner bl" /><i className="corner br" />
            <div className="dialog-title">Floor settings</div>
            <div className="dialog-body">Resize the envelope this facility&apos;s blueprint is drawn on.</div>
            <div className="field"><label>Facility name</label><input className="input" type="text" value={floorDraft.name} onChange={(e) => setFloorDraft((d) => ({ ...d, name: e.target.value }))} /></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div className="field"><label>Width (m)</label><input className="input" type="number" step="0.5" min="6" value={floorDraft.widthM} onChange={(e) => setFloorDraft((d) => ({ ...d, widthM: e.target.value }))} /></div>
              <div className="field"><label>Depth (m)</label><input className="input" type="number" step="0.5" min="6" value={floorDraft.heightM} onChange={(e) => setFloorDraft((d) => ({ ...d, heightM: e.target.value }))} /></div>
            </div>
            <div className="dialog-actions">
              <button className="btn btn-secondary" onClick={() => setFloorOpen(false)} style={{ flex: 1 }}>Cancel</button>
              <button className="btn btn-primary" onClick={handleFloorSave} disabled={busy} style={{ flex: 1 }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
