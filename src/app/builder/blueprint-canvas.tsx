"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LocationKind } from "@/db/schema";
import { KIND_APPEARANCE, kindLabelColor } from "./kind-appearance";
import { LOCATION_TYPES, TEMPLATE_KEYS, type TemplateKey } from "@/lib/blueprint-types";
import { getBlueprint, type LocationRow } from "./actions";
import type { FacilityLevel } from "@/lib/levels";
import { useConfirm } from "@/components/notifications";
import * as rawActions from "./actions";
import { unwrap } from "@/lib/action-result";
import { useNotify } from "@/components/notifications";
import { Gate } from "@/components/capabilities";

const addSector = unwrap(rawActions.addSector);
const addLevel = unwrap(rawActions.addLevel);
const renameLevel = unwrap(rawActions.renameLevel);
const removeTopLevel = unwrap(rawActions.removeTopLevel);
const applyTemplate = unwrap(rawActions.applyTemplate);
const createEntity = unwrap(rawActions.createEntity);
const deleteEntity = unwrap(rawActions.deleteEntity);
const duplicateEntity = unwrap(rawActions.duplicateEntity);
const restoreEntity = unwrap(rawActions.restoreEntity);
const updateEntity = unwrap(rawActions.updateEntity);
const updateFacility = unwrap(rawActions.updateFacility);

const PPM = 26;
const SNAP = 0.25;
const DEFAULT_LEFT_WIDTH = 214;
const DEFAULT_RIGHT_WIDTH = 306;
const LEFT_WIDTH_RANGE: [number, number] = [160, 420];
const RIGHT_WIDTH_RANGE: [number, number] = [220, 480];
const SIDEBAR_WIDTHS_KEY = "smartdepo:builder:sidebarWidths";

function clampWidth(v: number, [min, max]: [number, number]) {
  return Math.min(max, Math.max(min, v));
}
type Facility = { id: string; name: string; widthM: number; heightM: number };
// What the mouse does on the canvas (src/app/builder/canvas-modes):
// navigate = drag pans, wheel zooms; edit = select / move / resize;
// inspect = click selects to read, nothing moves. A drag threshold in
// edit mode means a click never nudges an object; Esc drops a drag.
export type CanvasMode = "navigate" | "edit" | "inspect";
const MODE_STORAGE_KEY = "smartdepo.canvas.mode";
const LEGEND_STORAGE_KEY = "smartdepo.canvas.legend";
const DRAG_THRESHOLD_PX = 4;
type Box = { xM: number; yM: number; widthM: number; heightM: number };

type Drag =
  | { kind: "move"; id: string; pointerStart: { x: number; y: number }; origin: Box }
  | { kind: "resize"; id: string; pointerStart: { x: number; y: number }; origin: Box };

// A kind picked up from the palette and not yet put down. Entered either by
// clicking a palette entry ("click": the cursor carries a real-scale ghost of
// the object until the floor is clicked — Esc puts it back) or by dragging
// one straight off the palette ("drag": mouseup over the floor places it,
// anywhere else cancels). `pointer` is the last mouse position in client px;
// the ghost is drawn from it every move. `sticky` (Shift) keeps the kind
// armed after each placement, for laying out a row of the same thing.
type Placing = {
  kind: LocationKind;
  source: "click" | "drag";
  pointer: { clientX: number; clientY: number } | null;
  sticky: boolean;
};

// Palette order = legend order. Grouped the way a floor plan is drawn:
// the space, then what stores things in it, then the building around it.
const PALETTE_GROUPS: { key: "areas" | "storage" | "structure"; kinds: LocationKind[] }[] = [
  { key: "areas", kinds: ["zone", "aisle"] },
  { key: "storage", kinds: ["rack", "platform", "pallet", "bin"] },
  { key: "structure", kinds: ["wall", "pillar", "dock", "door", "exit", "window", "vent"] },
];
const PALETTE_KINDS: LocationKind[] = PALETTE_GROUPS.flatMap((g) => g.kinds);

function snap(v: number) {
  return Math.round(v / SNAP) * SNAP;
}

type EntitySpec = {
  kind: LocationKind;
  xM: number;
  yM: number;
  widthM: number;
  heightM: number;
  bays: number;
  levels: number;
};

function specOf(e: LocationRow): EntitySpec {
  return { kind: e.kind as LocationKind, xM: e.xM, yM: e.yM, widthM: e.widthM, heightM: e.heightM, bays: e.bays, levels: e.levels };
}

type UndoEntry = { undo: () => Promise<void>; redo: () => Promise<void> };

// Occupancy across every cell (every level × bay), regardless of which
// level is currently being viewed — the inspector's aggregate stat.
function occupancyOf(entity: LocationRow, all: LocationRow[], occupied: Set<string>) {
  if (entity.bays <= 1 && entity.levels <= 1) return occupied.has(entity.id) ? 1 : 0;
  const kids = all.filter((l) => l.parentId === entity.id);
  if (kids.length === 0) return 0;
  return kids.filter((k) => occupied.has(k.id)).length / kids.length;
}

// The bay row to actually draw for one entity at the globally-selected
// level. A level higher than this entity has clamps to its own top level
// (an entity with fewer levels than the one being viewed still shows its
// top shelf, rather than going blank). "all" aggregates every level per bay
// into one cell — occupied if ANY level at that bay has stock.
function levelRow(entity: LocationRow, all: LocationRow[], selectedLevel: number | "all") {
  const kids = all.filter((l) => l.parentId === entity.id);
  if (kids.length === 0) return [] as { bay: number; ids: string[] }[];

  if (selectedLevel === "all") {
    const byBay = new Map<number, string[]>();
    for (const k of kids) {
      const bay = k.bay ?? 1;
      byBay.set(bay, [...(byBay.get(bay) ?? []), k.id]);
    }
    return [...byBay.entries()].sort((a, b) => a[0] - b[0]).map(([bay, ids]) => ({ bay, ids }));
  }

  const level = Math.min(selectedLevel, entity.levels);
  return kids
    .filter((k) => (k.level ?? 1) === level)
    .sort((a, b) => (a.bay ?? 1) - (b.bay ?? 1))
    .map((c) => ({ bay: c.bay ?? 1, ids: [c.id] }));
}

export function BlueprintCanvas({
  facility: initialFacility,
  initialLocations,
  initialOccupiedBinIds,
  initialLevels,
  initialHighlightBinId,
  readOnly = false,
}: {
  facility: Facility;
  initialLocations: LocationRow[];
  initialOccupiedBinIds: string[];
  initialLevels: FacilityLevel[];
  initialHighlightBinId?: string;
  // A worker's view: the server rejects every layout write for them anyway
  // (requirePermission("editLayout")), this just stops the UI offering
  // controls that would only ever produce an error.
  readOnly?: boolean;
}) {
  const t = useTranslations("builder");
  const router = useRouter();
  const [facility, setFacility] = useState(initialFacility);
  const [locations, setLocations] = useState(initialLocations);
  const [occupied, setOccupied] = useState(new Set(initialOccupiedBinIds));
  const [levels, setLevels] = useState<FacilityLevel[]>(initialLevels);
  const [levelsOpen, setLevelsOpen] = useState(false);
  const confirm = useConfirm();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedLevel, setSelectedLevel] = useState<number | "all">("all");
  const [zoom, setZoom] = useState(0.8);
  const [grid, setGrid] = useState(true);
  // The floating legend over the canvas. Open by default: it's the one
  // place a read-only viewer (no palette) learns what the colours mean.
  const [legendOpen, setLegendOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const notify = useNotify();
  const [status, setStatus] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [floorOpen, setFloorOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [confirmTemplate, setConfirmTemplate] = useState<TemplateKey | null>(null);
  const [floorDraft, setFloorDraft] = useState({
    name: facility.name,
    widthM: String(facility.widthM),
    heightM: String(facility.heightM),
  });
  const [localOverride, setLocalOverride] = useState<Record<string, Box>>({});
  const [mode, setModeState] = useState<CanvasMode>(readOnly ? "inspect" : "edit");
  // Map-only: what a worker sees, and what everyone sees on a phone —
  // the canvas with Navigate/Inspect, a compact sheet for the tapped
  // object, none of the builder's panels. Editing stays desktop-only
  // (docs/concept.md), so a manager on a phone gets the map too.
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  const mapOnly = readOnly || narrow;
  const [spacePan, setSpacePan] = useState(false);
  const panRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [panning, setPanning] = useState(false);
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null);
  const [pulseBinId, setPulseBinId] = useState<string | null>(null);
  // The value itself drives no rendering directly — bumping it just forces a
  // re-render so the undo/redo buttons re-read the (ref-backed) stacks.
  const [, setHistoryVersion] = useState(0);
  const [leftWidth, setLeftWidth] = useState(DEFAULT_LEFT_WIDTH);
  const [rightWidth, setRightWidth] = useState(DEFAULT_RIGHT_WIDTH);
  const [resizingSide, setResizingSide] = useState<"left" | "right" | null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  // Set at mousedown; the drag only becomes "live" past DRAG_THRESHOLD_PX.
  const dragArmRef = useRef<{ clientX: number; clientY: number; live: boolean } | null>(null);
  const [placing, setPlacing] = useState<Placing | null>(null);
  // Mirror of `placing` for the window-level mouse handlers, which are bound
  // once and would otherwise close over a stale value.
  const placingRef = useRef<Placing | null>(null);
  // Mousedown on a palette entry arms this; it becomes a "drag" placement
  // past DRAG_THRESHOLD_PX, or a "click" placement on mouseup if it never moved.
  const paletteArmRef = useRef<{ kind: LocationKind; clientX: number; clientY: number; shift: boolean } | null>(null);
  const boxRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const pendingHighlightRef = useRef<string | null>(initialHighlightBinId ?? null);
  const clipboardRef = useRef<{ liveId: string } | null>(null);
  const undoStack = useRef<UndoEntry[]>([]);
  const redoStack = useRef<UndoEntry[]>([]);
  const sidebarResizeRef = useRef<{ side: "left" | "right"; startX: number; startWidth: number } | null>(null);
  const sidebarWidthsRef = useRef({ left: DEFAULT_LEFT_WIDTH, right: DEFAULT_RIGHT_WIDTH });

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
      levels: String(selected.levels),
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

  // Restore any previously-saved panel widths after mount rather than in the
  // initial state itself — reading localStorage during the very first
  // (server-matching) render would make that render diverge from what the
  // server sent and trip a hydration mismatch.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SIDEBAR_WIDTHS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { left?: number; right?: number };
      if (typeof parsed.left === "number") {
        const left = clampWidth(parsed.left, LEFT_WIDTH_RANGE);
        sidebarWidthsRef.current.left = left;
        setLeftWidth(left);
      }
      if (typeof parsed.right === "number") {
        const right = clampWidth(parsed.right, RIGHT_WIDTH_RANGE);
        sidebarWidthsRef.current.right = right;
        setRightWidth(right);
      }
    } catch {
      // localStorage unavailable (private browsing, etc.) — just keep defaults.
    }
  }, []);

  function startSidebarResize(side: "left" | "right", ev: React.MouseEvent) {
    ev.preventDefault();
    sidebarResizeRef.current = { side, startX: ev.clientX, startWidth: side === "left" ? leftWidth : rightWidth };
    setResizingSide(side);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  useEffect(() => {
    function onMove(ev: MouseEvent) {
      const d = sidebarResizeRef.current;
      if (!d) return;
      const delta = ev.clientX - d.startX;
      if (d.side === "left") {
        const next = clampWidth(d.startWidth + delta, LEFT_WIDTH_RANGE);
        sidebarWidthsRef.current.left = next;
        setLeftWidth(next);
      } else {
        const next = clampWidth(d.startWidth - delta, RIGHT_WIDTH_RANGE);
        sidebarWidthsRef.current.right = next;
        setRightWidth(next);
      }
    }
    function onUp() {
      if (!sidebarResizeRef.current) return;
      sidebarResizeRef.current = null;
      setResizingSide(null);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      try {
        localStorage.setItem(SIDEBAR_WIDTHS_KEY, JSON.stringify(sidebarWidthsRef.current));
      } catch {
        // localStorage unavailable — resizing still works, just doesn't persist.
      }
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  useEffect(() => {
    if (!status) return;
    const timer = setTimeout(() => setStatus(null), 2200);
    return () => clearTimeout(timer);
  }, [status]);

  // A search result (or any other deep link) can land here with ?bin=<id> to
  // point straight at one exact bin instead of a text-only "current location"
  // answer — select its parent box, switch to the bin's level, scroll it into
  // view, and flash it, then drop the query param so a reload doesn't replay it.
  // The "consumed" flag is only set once the pulse timer actually FIRES, not
  // synchronously in the effect body — React's dev-only Strict Mode runs a
  // mount→cleanup→mount cycle once on initial mount, which cancels this
  // effect's first set of timers; consuming the ref synchronously would make
  // the second (real) mount see it as already-handled and never reschedule
  // them, leaving the pulse stuck on forever.
  useEffect(() => {
    const binId = pendingHighlightRef.current;
    if (!binId) return;
    const bin = locations.find((l) => l.id === binId);
    if (!bin) return;

    const parent = (bin.parentId && locations.find((l) => l.id === bin.parentId)) || bin;
    setSelectedId(parent.id);
    if (bin.level && bin.level > 1) setSelectedLevel(bin.level);
    if (zoom < 0.8) setZoom(1);
    setPulseBinId(bin.id);
    router.replace("/builder", { scroll: false });

    const scrollTimer = setTimeout(() => {
      boxRefs.current[parent.id]?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    }, 80);
    const pulseTimer = setTimeout(() => {
      setPulseBinId(null);
      pendingHighlightRef.current = null;
    }, 3600);
    return () => {
      clearTimeout(scrollTimer);
      clearTimeout(pulseTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locations]);

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
    setLevels(data.levels);
  }

  // ── Mouse modes ────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      if (window.localStorage.getItem(LEGEND_STORAGE_KEY) === "closed") setLegendOpen(false);
    } catch { /* storage unavailable: legend just stays open */ }
  }, []);
  function toggleLegend() {
    setLegendOpen((open) => {
      try { window.localStorage.setItem(LEGEND_STORAGE_KEY, open ? "closed" : "open"); } catch { /* ignore */ }
      return !open;
    });
  }

  const setMode = (m: CanvasMode) => {
    if ((readOnly || narrow) && m === "edit") return;
    setModeState(m);
    try { localStorage.setItem(MODE_STORAGE_KEY, m); } catch {}
  };
  useEffect(() => {
    try {
      const saved = localStorage.getItem(MODE_STORAGE_KEY) as CanvasMode | null;
      if (saved === "navigate" || saved === "inspect" || (saved === "edit" && !readOnly)) setModeState(saved);
    } catch {}
  }, [readOnly]);
  const panActive = mode === "navigate" || spacePan;
  // A phone can't edit: whatever was remembered, the map is inspect-or-pan.
  const effectiveMode: CanvasMode = mapOnly && mode === "edit" ? "inspect" : mode;
  // Map-only opens fitted to the floor once the wrapper has a size.
  useEffect(() => {
    if (!mapOnly) return;
    const id = requestAnimationFrame(() => fit());
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapOnly, facility.id]);

  // Zoom around a point of the wrapper (the cursor, or its centre), keeping
  // that point of the floor under the cursor.
  const zoomAt = useCallback((next: number, clientX?: number, clientY?: number) => {
    const wrap = wrapRef.current;
    const target = Math.max(0.2, Math.min(3, Math.round(next * 20) / 20));
    if (!wrap) { setZoom(target); return; }
    const r = wrap.getBoundingClientRect();
    const px = (clientX ?? r.left + r.width / 2) - r.left;
    const py = (clientY ?? r.top + r.height / 2) - r.top;
    const floorX = (wrap.scrollLeft + px) / zoom;
    const floorY = (wrap.scrollTop + py) / zoom;
    setZoom(target);
    requestAnimationFrame(() => {
      wrap.scrollLeft = floorX * target - px;
      wrap.scrollTop = floorY * target - py;
    });
  }, [zoom]);

  function startPan(ev: React.MouseEvent) {
    const wrap = wrapRef.current;
    if (!wrap) return;
    ev.preventDefault();
    panRef.current = { x: ev.clientX, y: ev.clientY, left: wrap.scrollLeft, top: wrap.scrollTop };
    setPanning(true);
  }

  useEffect(() => {
    function onMove(ev: MouseEvent) {
      const p = panRef.current;
      const wrap = wrapRef.current;
      if (!p || !wrap) return;
      wrap.scrollLeft = p.left - (ev.clientX - p.x);
      wrap.scrollTop = p.top - (ev.clientY - p.y);
    }
    function onUp() {
      if (panRef.current) { panRef.current = null; setPanning(false); }
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  // Wheel: ctrl/⌘ (and any wheel in navigate mode) zooms toward the cursor;
  // otherwise the wrapper scrolls as usual. Native listener so it can be
  // non-passive and stop the browser's page zoom.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const onWheel = (ev: WheelEvent) => {
      if (!(ev.ctrlKey || ev.metaKey || effectiveMode === "navigate")) return;
      ev.preventDefault();
      const factor = Math.exp(-ev.deltaY * 0.0015);
      zoomAt(zoom * factor, ev.clientX, ev.clientY);
    };
    wrap.addEventListener("wheel", onWheel, { passive: false });
    return () => wrap.removeEventListener("wheel", onWheel);
  }, [effectiveMode, zoom, zoomAt]);

  // Touch: one finger pans in navigate mode (the browser scrolls the wrapper
  // itself), two fingers pinch-zoom in any mode.
  function onTouchStart(ev: React.TouchEvent) {
    if (ev.touches.length === 2) {
      const [a, b] = [ev.touches[0], ev.touches[1]];
      pinchRef.current = { dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), zoom };
    }
  }
  function onTouchMove(ev: React.TouchEvent) {
    const pinch = pinchRef.current;
    if (!pinch || ev.touches.length !== 2) return;
    ev.preventDefault();
    const [a, b] = [ev.touches[0], ev.touches[1]];
    const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    zoomAt(pinch.zoom * (dist / pinch.dist), (a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);
  }
  function onTouchEnd() { pinchRef.current = null; }

  // ── Facility levels ────────────────────────────────────────────────────
  const levelName = (lv: FacilityLevel) => lv.name || t("levels.defaultName", { n: lv.index });

  async function handleAddLevel() {
    const n = levels.length + 1;
    const ok = await confirm({ title: t("levels.addTitle", { n }), body: t("levels.addBody"), confirmLabel: t("levels.add") });
    if (!ok) return;
    // Extending is a second, separate question, so Esc or the backdrop on
    // either dialog means "do nothing" — never "add anyway".
    const racksAtTop = locations.filter((l) => !l.isBin && l.levels === levels.length && LOCATION_TYPES[l.kind as LocationKind].spatial === "store").length;
    let extend = false;
    if (racksAtTop > 0) {
      extend = await confirm({ title: t("levels.extendTitle", { n, racks: racksAtTop }), body: t("levels.extendBody"), confirmLabel: t("levels.addExtend"), cancelLabel: t("levels.addOnly") });
    }
    setBusy(true);
    const done = await notify.run(() => addLevel(facility.id, extend), { success: t("levels.added", { n }) });
    if (done) { await reload(); clearHistory(); }
    setBusy(false);
  }

  async function handleRenameLevel(lv: FacilityLevel) {
    const name = await confirm({ title: t("levels.renameTitle", { n: lv.index }), input: { label: t("levels.renameLabel"), defaultValue: lv.name ?? "", placeholder: t("levels.defaultName", { n: lv.index }) }, confirmLabel: t("save") });
    if (name === null) return;
    const done = await notify.run(() => renameLevel(facility.id, lv.id, name || null));
    if (done !== undefined) await reload();
  }

  async function handleRemoveTopLevel() {
    const top = levels[levels.length - 1];
    const ok = await confirm({ title: t("levels.removeTitle", { name: levelName(top) }), body: t("levels.removeBody"), confirmLabel: t("delete"), danger: true });
    if (!ok) return;
    setBusy(true);
    const done = await notify.run(() => removeTopLevel(facility.id), { success: t("levels.removed", { name: levelName(top) }) });
    if (done) { await reload(); clearHistory(); if (selectedLevel !== "all" && selectedLevel > levels.length - 1) setSelectedLevel("all"); }
    setBusy(false);
  }

  // ── Undo/redo ──────────────────────────────────────────────────────────
  // A client-side stack of inverse-operation pairs, built on top of the same
  // server actions the UI already calls — not a snapshot/restore system, so
  // it only covers single-entity operations (create/delete/duplicate/paste,
  // move/resize, field edits) where "undo" has an unambiguous, safe meaning.
  // Applying a template or adding a sector touch many rows at once and are
  // already gated behind their own confirmation UI, so they intentionally
  // clear history instead of trying to participate in it.
  function pushUndo(entry: UndoEntry) {
    undoStack.current.push(entry);
    if (undoStack.current.length > 50) undoStack.current.shift();
    redoStack.current = [];
    setHistoryVersion((v) => v + 1);
  }

  function clearHistory() {
    undoStack.current = [];
    redoStack.current = [];
    setHistoryVersion((v) => v + 1);
  }

  async function applyEntityPatch(id: string, patch: Record<string, string | number>) {
    await updateEntity(id, patch);
    await reload();
    setSelectedId(id);
  }

  // create/delete/duplicate/paste all make a *row* appear or disappear, and
  // the server action always mints a fresh id — a mutable `liveId` lets the
  // same entry keep pointing at "this logical entity" across repeated
  // undo/redo cycles even though its underlying id changes each time.
  function makeCreateUndoEntry(spec: EntitySpec, initialId: string): UndoEntry {
    let liveId = initialId;
    return {
      undo: async () => {
        await deleteEntity(liveId);
        await reload();
        setSelectedId(null);
      },
      redo: async () => {
        const created = await restoreEntity(facility.id, spec);
        liveId = created.id;
        await reload();
        setSelectedId(created.id);
      },
    };
  }

  function makeDeleteUndoEntry(spec: EntitySpec, initialId: string): UndoEntry {
    let liveId = initialId;
    return {
      undo: async () => {
        const created = await restoreEntity(facility.id, spec);
        liveId = created.id;
        await reload();
        setSelectedId(created.id);
      },
      redo: async () => {
        await deleteEntity(liveId);
        await reload();
        setSelectedId(null);
      },
    };
  }

  async function handleUndo() {
    const entry = undoStack.current.pop();
    if (!entry) return;
    setBusy(true);
    try {
      await entry.undo();
      redoStack.current.push(entry);
      setStatus(t("status.undone"));
    } catch (e) {
      undoStack.current.push(entry);
      notify.error(e instanceof Error ? e.message : t("error.couldntUndo"));
    } finally {
      setHistoryVersion((v) => v + 1);
      setBusy(false);
    }
  }

  async function handleRedo() {
    const entry = redoStack.current.pop();
    if (!entry) return;
    setBusy(true);
    try {
      await entry.redo();
      undoStack.current.push(entry);
      setStatus(t("status.redone"));
    } catch (e) {
      redoStack.current.push(entry);
      notify.error(e instanceof Error ? e.message : t("error.couldntRedo"));
    } finally {
      setHistoryVersion((v) => v + 1);
      setBusy(false);
    }
  }

  function handleCopy() {
    if (!selected) return;
    clipboardRef.current = { liveId: selected.id };
    setStatus(t("status.copied"));
  }

  async function handlePaste() {
    const clip = clipboardRef.current;
    if (!clip) return;
    setBusy(true);
    try {
      const created = await duplicateEntity(clip.liveId);
      await reload();
      setSelectedId(created.id);
      clip.liveId = created.id;
      pushUndo(makeCreateUndoEntry(specOf(created), created.id));
      setStatus(t("status.pasted"));
    } catch (e) {
      notify.error(e instanceof Error ? e.message : t("error.couldntDuplicate"));
    } finally {
      setBusy(false);
    }
  }

  async function handleAdd(kind: LocationKind, xM: number, yM: number) {
    setBusy(true);
    try {
      const created = await createEntity(facility.id, kind, xM, yM);
      await reload();
      setSelectedId(created.id);
      pushUndo(makeCreateUndoEntry(specOf(created), created.id));
    } catch (e) {
      notify.error(e instanceof Error ? e.message : t("error.couldntAdd"));
    } finally {
      setBusy(false);
    }
  }

  function updatePlacing(next: Placing | null) {
    placingRef.current = next;
    setPlacing(next);
  }

  function armPlacing(kind: LocationKind, source: Placing["source"], sticky: boolean, pointer: Placing["pointer"]) {
    if (readOnly) return;
    // Clicking the already-armed kind puts it back down.
    if (source === "click" && placingRef.current?.kind === kind) { updatePlacing(null); return; }
    if (mode !== "edit") setMode("edit");
    setSelectedId(null);
    updatePlacing({ kind, source, sticky, pointer });
  }

  function cancelPlacing() {
    paletteArmRef.current = null;
    if (placingRef.current) updatePlacing(null);
  }

  // Where the carried object would land, in floor metres: centred on the
  // cursor, snapped to the grid and kept inside the floor — or null when the
  // cursor isn't over the floor at all.
  function ghostBox(p: Placing): Box | null {
    const el = canvasRef.current;
    if (!p.pointer || !el) return null;
    const r = el.getBoundingClientRect();
    const { clientX, clientY } = p.pointer;
    if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) return null;
    const type = LOCATION_TYPES[p.kind];
    const widthM = type.w;
    const heightM = type.h;
    const cx = (clientX - r.left) / z;
    const cy = (clientY - r.top) / z;
    const maxX = Math.max(0, facility.widthM - widthM);
    const maxY = Math.max(0, facility.heightM - heightM);
    return {
      xM: Math.min(maxX, Math.max(0, snap(cx - widthM / 2))),
      yM: Math.min(maxY, Math.max(0, snap(cy - heightM / 2))),
      widthM,
      heightM,
    };
  }

  function placeAt(p: Placing, pointer: { clientX: number; clientY: number }) {
    const box = ghostBox({ ...p, pointer });
    if (!box) return false;
    void handleAdd(p.kind, box.xM, box.yM);
    if (p.sticky) updatePlacing({ ...p, source: "click", pointer });
    else updatePlacing(null);
    return true;
  }

  function startPaletteDrag(kind: LocationKind, ev: React.MouseEvent) {
    if (readOnly || busy) return;
    ev.preventDefault();
    paletteArmRef.current = { kind, clientX: ev.clientX, clientY: ev.clientY, shift: ev.shiftKey };
  }

  async function commit(patch: Record<string, string | number>) {
    if (!selected) return;
    const id = selected.id;
    const prevPatch: Record<string, string | number> = {};
    for (const key of Object.keys(patch)) {
      const v = (selected as unknown as Record<string, unknown>)[key];
      if (typeof v === "string" || typeof v === "number") prevPatch[key] = v;
    }
    setBusy(true);
    try {
      await updateEntity(id, patch);
      await reload();
      pushUndo({ undo: () => applyEntityPatch(id, prevPatch), redo: () => applyEntityPatch(id, patch) });
    } catch (e) {
      notify.error(e instanceof Error ? e.message : t("error.couldntSave"));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!selected) return;
    const spec = specOf(selected);
    const id = selected.id;
    setBusy(true);
    try {
      await deleteEntity(id);
      setSelectedId(null);
      await reload();
      pushUndo(makeDeleteUndoEntry(spec, id));
    } catch (e) {
      notify.error(e instanceof Error ? e.message : t("error.couldntDelete"));
    } finally {
      setBusy(false);
    }
  }

  async function handleDuplicate() {
    if (!selected) return;
    setBusy(true);
    try {
      const copy = await duplicateEntity(selected.id);
      await reload();
      setSelectedId(copy.id);
      pushUndo(makeCreateUndoEntry(specOf(copy), copy.id));
    } catch (e) {
      notify.error(e instanceof Error ? e.message : t("error.couldntDuplicate"));
    } finally {
      setBusy(false);
    }
  }

  async function handleFloorSave() {
    setBusy(true);
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
      notify.error(e instanceof Error ? e.message : t("error.couldntSaveFloor"));
    } finally {
      setBusy(false);
    }
  }

  function chooseTemplate(key: TemplateKey) {
    if (locations.length > 0) {
      setConfirmTemplate(key);
      return;
    }
    void runTemplate(key, false);
  }

  async function runTemplate(key: TemplateKey, replace: boolean) {
    setBusy(true);
    try {
      await applyTemplate(facility.id, key, replace);
      await reload();
      setSelectedId(null);
      setTemplatesOpen(false);
      setConfirmTemplate(null);
      clearHistory();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : t("error.couldntApplyTemplate"));
    } finally {
      setBusy(false);
    }
  }

  async function handleAddSector() {
    setBusy(true);
    try {
      const created = await addSector(facility.id);
      await reload();
      setSelectedId(created.id);
      clearHistory();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : t("error.couldntAdd"));
    } finally {
      setBusy(false);
    }
  }

  function paletteHint(kind: LocationKind) {
    const type = LOCATION_TYPES[kind];
    if (type.spatial === "area") return t(`hint.${kind}` as "hint.zone" | "hint.aisle");
    if (type.spatial === "fixture") return t("hint.fixture");
    if (type.bays > 1) return t("hint.baysDefault", { n: type.bays });
    return t("hint.oneSlot");
  }

  const z = zoom * PPM;

  function pointFromEvent(ev: { clientX: number; clientY: number }) {
    const el = canvasRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return { x: (ev.clientX - r.left) / z, y: (ev.clientY - r.top) / z };
  }

  function computeDragBox(d: Drag, ev: { clientX: number; clientY: number }): Box {
    const p = pointFromEvent(ev);
    const deltaX = p.x - d.pointerStart.x;
    const deltaY = p.y - d.pointerStart.y;
    if (d.kind === "move") {
      return {
        xM: Math.max(0, snap(d.origin.xM + deltaX)),
        yM: Math.max(0, snap(d.origin.yM + deltaY)),
        widthM: d.origin.widthM,
        heightM: d.origin.heightM,
      };
    }
    return {
      xM: d.origin.xM,
      yM: d.origin.yM,
      widthM: Math.max(0.3, snap(d.origin.widthM + deltaX)),
      heightM: Math.max(0.3, snap(d.origin.heightM + deltaY)),
    };
  }

  function startDrag(kind: Drag["kind"], ev: React.MouseEvent, entity: LocationRow) {
    if (panActive) return; // the wrapper's handler pans
    ev.stopPropagation();
    ev.preventDefault();
    setSelectedId(entity.id);
    if (readOnly || effectiveMode !== "edit") return;
    dragArmRef.current = { clientX: ev.clientX, clientY: ev.clientY, live: false };
    dragRef.current = {
      kind,
      id: entity.id,
      pointerStart: pointFromEvent(ev),
      origin: { xM: entity.xM, yM: entity.yM, widthM: entity.widthM, heightM: entity.heightM },
    } as Drag;
  }

  function cancelDrag() {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    dragArmRef.current = null;
    setLocalOverride((o) => { const next = { ...o }; delete next[d.id]; return next; });
  }

  useEffect(() => {
    function onMove(ev: MouseEvent) {
      const d = dragRef.current;
      const arm = dragArmRef.current;
      if (!d || !arm) return;
      // A click is not a drag: nothing moves until the pointer has travelled.
      if (!arm.live) {
        if (Math.hypot(ev.clientX - arm.clientX, ev.clientY - arm.clientY) < DRAG_THRESHOLD_PX) return;
        arm.live = true;
      }
      setLocalOverride((o) => ({ ...o, [d.id]: computeDragBox(d, ev) }));
    }
    function onUp(ev: MouseEvent) {
      const d = dragRef.current;
      const arm = dragArmRef.current;
      if (!d) return;
      dragRef.current = null;
      dragArmRef.current = null;
      if (!arm?.live) return; // a click: selected, nothing to save
      const box = computeDragBox(d, ev);
      setLocalOverride((o) => {
        const next = { ...o };
        delete next[d.id];
        return next;
      });
      const unchanged =
        d.kind === "move"
          ? box.xM === d.origin.xM && box.yM === d.origin.yM
          : box.widthM === d.origin.widthM && box.heightM === d.origin.heightM;
      if (unchanged) return;

      const patch: Record<string, number> =
        d.kind === "move" ? { xM: box.xM, yM: box.yM } : { widthM: box.widthM, heightM: box.heightM };
      const prevPatch: Record<string, number> =
        d.kind === "move" ? { xM: d.origin.xM, yM: d.origin.yM } : { widthM: d.origin.widthM, heightM: d.origin.heightM };
      setBusy(true);
      updateEntity(d.id, patch)
        .then(() => reload())
        .then(() => {
          pushUndo({ undo: () => applyEntityPatch(d.id, prevPatch), redo: () => applyEntityPatch(d.id, patch) });
        })
        .catch((e) => notify.error(e instanceof Error ? e.message : t("error.couldntSave")))
        .finally(() => setBusy(false));
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [z]);

  // Palette pick-up and placement. A palette mousedown is armed like an
  // object drag: travel past the threshold turns it into a "drag" placement
  // (ghost follows the cursor, mouseup over the floor places it); releasing
  // without travel is a click, which arms a "click" placement instead (the
  // ghost follows until the floor is clicked — see the wrapper's capture
  // handler). Either way the cursor position is tracked here so the ghost
  // re-renders every move.
  useEffect(() => {
    function onMove(ev: MouseEvent) {
      const arm = paletteArmRef.current;
      if (arm) {
        if (Math.hypot(ev.clientX - arm.clientX, ev.clientY - arm.clientY) < DRAG_THRESHOLD_PX) return;
        paletteArmRef.current = null;
        armPlacing(arm.kind, "drag", arm.shift, { clientX: ev.clientX, clientY: ev.clientY });
        return;
      }
      const p = placingRef.current;
      if (!p) return;
      updatePlacing({ ...p, pointer: { clientX: ev.clientX, clientY: ev.clientY } });
    }
    function onUp(ev: MouseEvent) {
      const arm = paletteArmRef.current;
      if (arm) {
        paletteArmRef.current = null;
        armPlacing(arm.kind, "click", arm.shift, { clientX: ev.clientX, clientY: ev.clientY });
        return;
      }
      const p = placingRef.current;
      if (!p || p.source !== "drag") return;
      // Dropped off the floor: nothing is created and the palette lets go.
      if (!placeAt(p, { clientX: ev.clientX, clientY: ev.clientY })) updatePlacing(null);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [z, facility.widthM, facility.heightM, mode, readOnly]);

  // Leaving edit mode (or losing edit rights) puts a carried object back.
  useEffect(() => {
    if (placingRef.current && (effectiveMode !== "edit" || readOnly)) cancelPlacing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveMode, readOnly]);

  useEffect(() => {
    function isEditableTarget(el: EventTarget | null) {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
    }
    function onKeyDown(ev: KeyboardEvent) {
      if (isEditableTarget(ev.target)) return;
      if (floorOpen || templatesOpen || confirmTemplate || levelsOpen) return;
      const meta = ev.metaKey || ev.ctrlKey;
      const key = ev.key.toLowerCase();
      if (!meta) {
        if (key === "h") { setMode("navigate"); return; }
        if (key === "v" && !readOnly) { setMode("edit"); return; }
        if (key === "i") { setMode("inspect"); return; }
        if (key === " ") { ev.preventDefault(); setSpacePan(true); return; }
        if (key === "escape") { cancelDrag(); cancelPlacing(); return; }
      }
      if (readOnly) return;
      if (meta && key === "z") {
        ev.preventDefault();
        if (ev.shiftKey) void handleRedo();
        else void handleUndo();
        return;
      }
      if (meta && key === "y") {
        ev.preventDefault();
        void handleRedo();
        return;
      }
      if (meta && key === "c") {
        if (window.getSelection?.()?.toString()) return; // preserve native text copy
        ev.preventDefault();
        handleCopy();
        return;
      }
      if (meta && key === "v") {
        ev.preventDefault();
        void handlePaste();
        return;
      }
      if (!meta && (ev.key === "Backspace" || ev.key === "Delete") && selectedId) {
        ev.preventDefault();
        void handleDelete();
      }
    }
    function onKeyUp(ev: KeyboardEvent) {
      if (ev.key === " ") setSpacePan(false);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); };
  });

  const topLevel = locations.filter((l) => {
    if (!l.parentId) return true;
    const parent = locations.find((p) => p.id === l.parentId);
    return parent?.kind === "zone";
  });
  const composition = PALETTE_KINDS.map((k) => ({
    kind: k,
    label: t(`kindPlural.${k}`),
    n: locations.filter((l) => l.kind === k).length,
  })).filter((c) => c.n > 0);

  const templateButtons = (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {TEMPLATE_KEYS.map((key) => (
        <button
          key={key}
          className="btn btn-secondary"
          onClick={() => chooseTemplate(key)}
          disabled={busy}
          title={t(`template.${key}.description`)}
          style={{ textAlign: "left" }}
        >
          {t(`template.${key}.name`)}
        </button>
      ))}
    </div>
  );

  return (
    <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: mapOnly ? "minmax(0,1fr)" : `${leftWidth}px 6px minmax(360px,1fr) 6px ${rightWidth}px` }}>
      {!mapOnly && (
      <div style={{ background: "#fff", overflow: "auto", padding: 13 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 11, letterSpacing: ".16em", textTransform: "uppercase", color: "color-mix(in srgb,var(--color-text) 55%,transparent)" }}>
            {t("entities")}
          </div>
          {readOnly && (
            <div style={{ fontSize: 11, lineHeight: 1.45, padding: "8px 9px", border: "1px solid var(--color-divider)", background: "var(--color-bg)", marginBottom: 3 }}>
              <span className="tag tag-outline" style={{ marginRight: 6 }}>{t("viewOnly")}</span>
              {t("viewOnlyHint")}
            </div>
          )}
          {!readOnly && (
            <div style={{ fontSize: 11, lineHeight: 1.45, color: "color-mix(in srgb,var(--color-text) 60%,transparent)", marginBottom: 3 }}>
              {placing ? t(placing.sticky ? "placingHintSticky" : "placingHint") : t("entitiesHint")}
            </div>
          )}

          {!readOnly && PALETTE_GROUPS.map((group) => (
            <div key={group.key} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontFamily: "var(--font-heading)", fontSize: 10, letterSpacing: ".16em", textTransform: "uppercase", color: "color-mix(in srgb,var(--color-text) 50%,transparent)", marginTop: 4 }}>
                {t(`paletteGroup.${group.key}`)}
              </div>
              {group.kinds.map((kind) => {
            const type = LOCATION_TYPES[kind];
            const armed = placing?.kind === kind;
            return (
              <button
                key={kind}
                onMouseDown={(ev) => startPaletteDrag(kind, ev)}
                // Keyboard activation (Enter/Space) — the mouse path is handled
                // on mousedown/mouseup so a press can turn into a drag.
                onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); armPlacing(kind, "click", ev.shiftKey, null); } }}
                aria-pressed={armed}
                disabled={busy}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "7px 8px",
                  border: `1px solid ${armed ? "var(--color-accent)" : "var(--color-divider)"}`,
                  background: armed ? "var(--color-accent-100)" : "#fff", cursor: "grab",
                  textAlign: "left", font: "inherit",
                }}
              >
                <div style={{ width: 24, height: 20, flex: "none", ...KIND_APPEARANCE[kind] }} />
                <div>
                  <div style={{ fontFamily: "var(--font-heading)", fontSize: 14, letterSpacing: ".04em" }}>{t(`kind.${kind}`).toUpperCase()}</div>
                  <div style={{ fontSize: 10, color: "color-mix(in srgb,var(--color-text) 50%,transparent)" }}>
                    {type.w.toFixed(1)} × {type.h.toFixed(1)} m · {paletteHint(kind)}
                  </div>
                </div>
              </button>
            );
              })}
            </div>
          ))}

          {!readOnly && (
            <button className="btn btn-secondary btn-block" onClick={handleAddSector} disabled={busy} title={t("addSectorHint")}>
              {t("addSector")}
            </button>
          )}

          <div style={{ height: 1, background: "var(--color-divider)", margin: "9px 0" }} />
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 11, letterSpacing: ".16em", textTransform: "uppercase", color: "color-mix(in srgb,var(--color-text) 55%,transparent)" }}>
            {t("floor")}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "color-mix(in srgb,var(--color-text) 60%,transparent)" }}>{t("objects")}</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{topLevel.length}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "color-mix(in srgb,var(--color-text) 60%,transparent)" }}>{t("envelope")}</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{facility.widthM} × {facility.heightM} m</span>
            </div>
          </div>
          {!readOnly && (
            <>
              <button className="btn btn-secondary btn-block" onClick={() => setFloorOpen(true)}>{t("editFloor")}</button>
              <button className="btn btn-secondary btn-block" onClick={() => setTemplatesOpen(true)}>{t("templatesButton")}</button>
            </>
          )}
        </div>
      </div>
      )}

      {!mapOnly && (
      <div
        className={resizingSide === "left" ? "resize-handle dragging" : "resize-handle"}
        onMouseDown={(ev) => startSidebarResize("left", ev)}
        title={t("resizePanel")}
      />
      )}

      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", background: "var(--color-bg)", position: "relative" }}>
        <div style={{ flex: "none", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 7, padding: "7px 11px", background: "#fff", borderBottom: "1px solid var(--color-divider)" }}>
          <div className="seg" role="radiogroup" aria-label={t("mode.label")}>
            {(["navigate", ...(mapOnly ? [] : ["edit" as const]), "inspect"] as CanvasMode[]).map((m) => (
              <button
                key={m}
                className="seg-opt"
                role="radio"
                aria-checked={effectiveMode === m}
                onClick={() => setMode(m)}
                title={t(`mode.${m}Hint`)}
                style={{ background: effectiveMode === m ? "var(--color-accent)" : undefined, color: effectiveMode === m ? "var(--color-bg)" : undefined, fontSize: 11, letterSpacing: ".08em" }}
              >
                {t(`mode.${m}`)}
              </button>
            ))}
          </div>
          <div style={{ width: 1, height: 17, background: "var(--color-divider)" }} />
          <button className="btn btn-secondary" onClick={() => zoomAt(zoom - 0.1)} style={{ minWidth: 26, padding: "1px 7px" }}>−</button>
          <button className="btn btn-ghost" onClick={() => zoomAt(1)} title={t("zoom100")} style={{ fontSize: 11, fontVariantNumeric: "tabular-nums", minWidth: 40, padding: "1px 4px" }}>{Math.round(zoom * 100)}%</button>
          <button className="btn btn-secondary" onClick={() => zoomAt(zoom + 0.1)} style={{ minWidth: 26, padding: "1px 7px" }}>+</button>
          <button className="btn btn-secondary" onClick={fit} style={{ padding: "1px 8px", fontSize: 11, letterSpacing: ".08em" }}>{t("zoomFit")}</button>
          {!mapOnly && <button className="btn btn-ghost" onClick={() => setGrid((g) => !g)} style={{ fontSize: 11, letterSpacing: ".08em" }}>{grid ? t("gridOn") : t("gridOff")}</button>}
          <button className="btn btn-ghost" onClick={toggleLegend} aria-pressed={legendOpen} style={{ fontSize: 11, letterSpacing: ".08em" }}>{t("legend")}</button>

          <div style={{ width: 1, height: 17, background: "var(--color-divider)" }} />
          {!mapOnly && (
            <>
              <button className="btn btn-secondary" onClick={handleUndo} disabled={busy || undoStack.current.length === 0} title={t("undo")} style={{ minWidth: 26, padding: "1px 7px" }}>↺</button>
              <button className="btn btn-secondary" onClick={handleRedo} disabled={busy || redoStack.current.length === 0} title={t("redo")} style={{ minWidth: 26, padding: "1px 7px" }}>↻</button>
            </>
          )}

          {(levels.length > 1 || !readOnly) && (
            <>
              <div style={{ width: 1, height: 17, background: "var(--color-divider)" }} />
              <span style={{ fontFamily: "var(--font-heading)", fontSize: 10, letterSpacing: ".14em", color: "color-mix(in srgb,var(--color-text) 55%,transparent)" }}>
                {t("level")}
              </span>
              <div className="seg">
                <button
                  className="seg-opt"
                  onClick={() => setSelectedLevel("all")}
                  style={{ background: selectedLevel === "all" ? "var(--color-accent)" : undefined, color: selectedLevel === "all" ? "var(--color-bg)" : undefined, fontSize: 11 }}
                >
                  {t("allLevels")}
                </button>
                {levels.map((lv) => (
                  <button
                    key={lv.id}
                    className="seg-opt"
                    onClick={() => setSelectedLevel(lv.index)}
                    title={levelName(lv)}
                    style={{ background: selectedLevel === lv.index ? "var(--color-accent)" : undefined, color: selectedLevel === lv.index ? "var(--color-bg)" : undefined, fontSize: 11 }}
                  >
                    {lv.name ? `${lv.index} · ${lv.name}` : lv.index}
                  </button>
                ))}
              </div>
              {!mapOnly && (
                <button className="btn btn-secondary" onClick={() => setLevelsOpen(true)} disabled={busy} title={t("levels.manage")} style={{ minWidth: 26, padding: "1px 7px" }}>⚙</button>
              )}
            </>
          )}
          {status && <span style={{ fontSize: 11, color: "var(--color-accent-700)", marginLeft: 8 }}>{status}</span>}
        </div>

        <div
          ref={wrapRef}
          className={`canvas-wrap canvas-mode-${panActive ? "navigate" : effectiveMode}${panning ? " is-panning" : ""}${placing ? " is-placing" : ""}`}
          style={{ flex: 1, minHeight: 0, position: "relative", overflow: "auto" }}
          // Capture phase so a carried object lands where the mouse is even
          // over an existing object, which would otherwise start a move drag.
          onMouseDownCapture={(e) => {
            const p = placingRef.current;
            if (!p || p.source !== "click" || e.button !== 0 || busy) return;
            e.stopPropagation();
            e.preventDefault();
            placeAt(p, { clientX: e.clientX, clientY: e.clientY });
          }}
          onMouseDown={(e) => {
            if (panActive) { startPan(e); return; }
            if (e.target === e.currentTarget) setSelectedId(null);
          }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div style={{ display: "inline-block", padding: "30px 22px 22px 34px", position: "relative" }}>
            <div
              ref={canvasRef}
              style={{
                position: "relative", width: facility.widthM * z, height: facility.heightM * z,
                background: "#fff", border: "1.5px solid var(--color-accent-900)", boxShadow: "var(--shadow-md)",
                backgroundImage: grid
                  ? "linear-gradient(to right,var(--color-accent-100) 0 1px,transparent 1px),linear-gradient(to bottom,var(--color-accent-100) 0 1px,transparent 1px)"
                  : undefined,
                backgroundSize: grid ? `${z}px ${z}px,${z}px ${z}px` : undefined,
              }}
              onMouseDown={(e) => { if (!panActive && e.target === e.currentTarget) setSelectedId(null); }}
            >
              {topLevel.length === 0 && (
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, textAlign: "center", padding: 20 }}>
                  <div style={{ fontFamily: "var(--font-heading)", fontSize: 21, letterSpacing: ".08em", color: "var(--color-accent-700)", pointerEvents: "none" }}>{t("emptyFloorTitle")}</div>
                  <div style={{ fontSize: 13, maxWidth: 320, color: "color-mix(in srgb,var(--color-text) 60%,transparent)", pointerEvents: "none" }}>
                    {readOnly ? t("emptyFloorBodyReadOnly") : t("emptyFloorBody")}
                  </div>
                  {!mapOnly && (
                    <>
                      <div style={{ fontSize: 11, color: "color-mix(in srgb,var(--color-text) 55%,transparent)", marginTop: 6, pointerEvents: "none" }}>
                        {t("templatePrompt")}
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                        {TEMPLATE_KEYS.map((key) => (
                          <button key={key} className="btn btn-secondary" onClick={() => chooseTemplate(key)} disabled={busy} title={t(`template.${key}.description`)}>
                            {t(`template.${key}.name`)}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
              {placing && (() => {
                const g = ghostBox(placing);
                if (!g) return null;
                const type = LOCATION_TYPES[placing.kind];
                return (
                  <div
                    aria-hidden
                    style={{
                      position: "absolute", left: g.xM * z, top: g.yM * z, width: g.widthM * z, height: g.heightM * z,
                      pointerEvents: "none", zIndex: 7, opacity: 0.7,
                      outline: "1.5px dashed var(--color-accent)", outlineOffset: 1,
                      ...KIND_APPEARANCE[placing.kind],
                    }}
                  >
                    <div style={{
                      position: "absolute", left: 0, top: -3, transform: "translateY(-100%)", whiteSpace: "nowrap",
                      fontFamily: "var(--font-heading)", fontSize: type.spatial === "area" ? 11 : 9, letterSpacing: ".1em",
                      color: kindLabelColor(placing.kind),
                    }}>
                      {t(`kind.${placing.kind}`).toUpperCase()} · {g.xM.toFixed(2)}, {g.yM.toFixed(2)} m
                    </div>
                  </div>
                );
              })()}
              {topLevel.map((e) => {
                const type = LOCATION_TYPES[e.kind as LocationKind];
                const isSel = e.id === selectedId;
                const live = localOverride[e.id] ?? e;
                const box: React.CSSProperties = {
                  position: "absolute", left: live.xM * z, top: live.yM * z, width: live.widthM * z, height: live.heightM * z,
                  cursor: "move",
                  zIndex: type.spatial === "area" ? 1 : type.spatial === "fixture" ? 2 : 3,
                  ...KIND_APPEARANCE[e.kind as LocationKind],
                };
                if (isSel) { box.outline = "1.5px solid var(--color-accent)"; box.outlineOffset = 1; box.zIndex = 6; }

                const row = type.spatial === "store" && e.bays * e.levels > 1 ? levelRow(e, locations, selectedLevel) : [];

                return (
                  <div
                    key={e.id}
                    ref={(el) => { boxRefs.current[e.id] = el; }}
                    style={box}
                    onMouseDown={(ev) => startDrag("move", ev, e)}
                    title={`${e.code ?? e.name} · ${e.name}`}
                  >
                    {type.spatial === "store" && e.levels > 1 && (
                      // The four upright posts a real second-level platform is
                      // bolted to, shown as corner marks (the footprint's
                      // actual corners, not a spatial subdivision) — a level
                      // is invisible from top-down otherwise, so this is the
                      // one cue that something is held up above this rack.
                      <>
                        <span style={{ position: "absolute", left: -1, top: -1, width: 4, height: 4, background: "var(--color-accent-900)", pointerEvents: "none", zIndex: 5 }} />
                        <span style={{ position: "absolute", right: -1, top: -1, width: 4, height: 4, background: "var(--color-accent-900)", pointerEvents: "none", zIndex: 5 }} />
                        <span style={{ position: "absolute", left: -1, bottom: -1, width: 4, height: 4, background: "var(--color-accent-900)", pointerEvents: "none", zIndex: 5 }} />
                        <span style={{ position: "absolute", right: -1, bottom: -1, width: 4, height: 4, background: "var(--color-accent-900)", pointerEvents: "none", zIndex: 5 }} />
                      </>
                    )}
                    {/* A pillar grid or a run of windows would drown the plan in
                        9px labels — small fixtures keep theirs for the tooltip and
                        the inspector, and show it only while selected. */}
                    {!(type.spatial === "fixture" && live.widthM * live.heightM < 1 && !isSel) && (
                    <div
                      onMouseDown={(ev) => startDrag("move", ev, e)}
                      style={{
                        position: "absolute", left: 0, top: -3, transform: "translateY(-100%)",
                        display: "flex", alignItems: "baseline", gap: 3,
                        fontFamily: "var(--font-heading)", fontSize: type.spatial === "area" ? 11 : 9,
                        letterSpacing: type.spatial === "area" ? ".14em" : ".1em", whiteSpace: "nowrap",
                        color: kindLabelColor(e.kind as LocationKind),
                        cursor: "pointer",
                      }}
                    >
                      <span>{e.kind === "zone" ? `${e.code} · ${e.name}` : (type.spatial === "fixture" ? e.name : e.code)}</span>
                      {e.levels > 1 && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                          <svg width="8" height="7" viewBox="0 0 10 8" aria-hidden="true">
                            <rect x="0" y="0" width="10" height="2" fill="currentColor" opacity="0.55" />
                            <rect x="0" y="3" width="10" height="2" fill="currentColor" opacity="0.75" />
                            <rect x="0" y="6" width="10" height="2" fill="currentColor" />
                          </svg>
                          {e.levels}{t("levelsAbbrev")}
                        </span>
                      )}
                    </div>
                    )}

                    {row.length > 0 ? (
                      <div style={{ display: "grid", gridTemplateColumns: `repeat(${row.length},minmax(0,1fr))`, gap: 1, padding: 1, width: "100%", height: "100%" }}>
                        {row.map(({ bay, ids }) => {
                          const isOcc = ids.some((id) => occupied.has(id));
                          const targetId = ids[0];
                          const cellCode =
                            ids.length === 1
                              ? (locations.find((l) => l.id === targetId)?.code ?? `${e.code}-${bay}`)
                              : `${e.code}-${bay}`;
                          return (
                            <Link
                              key={bay}
                              href={`/builder/bin/${targetId}`}
                              onMouseDown={(ev) => ev.stopPropagation()}
                              title={`${cellCode} — ${isOcc ? t("stocked") : t("empty")}`}
                              className={pulseBinId && ids.includes(pulseBinId) ? "locate-ping" : undefined}
                              style={{
                                border: "1px solid var(--color-neutral-300)",
                                // Unoccupied cells stay translucent so the parent's kind
                                // pattern (rack tint, platform crosshatch, …) still reads
                                // through the bay grid instead of being papered over.
                                backgroundColor: isOcc ? "var(--color-accent-200)" : "color-mix(in srgb,#fff 55%,transparent)",
                                // Each bay is a pallet position — an occupied one gets the
                                // same three-deck-board slats as the pallet kind itself, so
                                // "stocked" reads as an actual loaded pallet sitting there.
                                backgroundImage: isOcc
                                  ? "linear-gradient(color-mix(in srgb,var(--color-accent-700) 45%,transparent) 0 20%,transparent 20% 40%,color-mix(in srgb,var(--color-accent-700) 45%,transparent) 40% 60%,transparent 60% 80%,color-mix(in srgb,var(--color-accent-700) 45%,transparent) 80% 100%)"
                                  : undefined,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: 8, color: "color-mix(in srgb,var(--color-text) 55%,transparent)",
                                minWidth: 0, overflow: "hidden", textDecoration: "none",
                              }}
                            />
                          );
                        })}
                      </div>
                    ) : type.spatial === "store" && e.isBin ? (
                      <Link
                        href={`/builder/bin/${e.id}`}
                        onMouseDown={(ev) => ev.stopPropagation()}
                        className={pulseBinId === e.id ? "locate-ping" : undefined}
                        style={{ display: "block", width: "100%", height: "100%", background: occupied.has(e.id) ? "var(--color-accent-200)" : undefined }}
                      />
                    ) : null}

                    {isSel && (
                      <div
                        onMouseDown={(ev) => startDrag("resize", ev, e)}
                        hidden={effectiveMode !== "edit"}
                        style={{ position: "absolute", right: -5, bottom: -5, width: 10, height: 10, background: "var(--color-accent)", cursor: "nwse-resize", zIndex: 9 }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        {mapOnly && selected && (
          // The phone's inspector: what the tapped object is and where to go
          // from it, without the desktop panel.
          <div className="map-sheet blueprint">
            <i className="corner tl" /><i className="corner tr" /><i className="corner bl" /><i className="corner br" />
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--color-accent)" }}>{t(`kind.${selected.kind}`)}</div>
                <div style={{ fontFamily: "var(--font-heading)", fontSize: 22, lineHeight: 1.05 }}>{selected.code}</div>
                <div className="text-muted" style={{ fontSize: 12, marginTop: 2 }}>
                  {selected.name}
                  {LOCATION_TYPES[selected.kind as LocationKind].spatial === "store" && selected.bays * selected.levels > 1 && (
                    <> · {t("cellCount", { n: selected.bays * selected.levels })} · {Math.round(occupancyOf(selected, locations, occupied) * 100)}% {t("occupied").toLowerCase()}</>
                  )}
                </div>
              </div>
              <button type="button" className="btn btn-ghost" onClick={() => setSelectedId(null)} aria-label={t("cancel")} style={{ fontSize: 18, lineHeight: 1, padding: "2px 8px" }}>×</button>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              {selected.isBin && (
                <Link href={`/builder/bin/${selected.id}`} className="btn btn-primary" style={{ flex: 1 }}>{t("viewStock")}</Link>
              )}
              <Gate capability="printLabels" mode="disable">
                <Link href={selected.isBin ? `/labels?bin=${selected.id}` : `/labels?parent=${selected.id}`} className="btn btn-secondary" style={{ flex: 1 }}>
                  {selected.isBin ? t("printLabel") : t("printLabels")}
                </Link>
              </Gate>
            </div>
          </div>
        )}

        {legendOpen && composition.length > 0 && !(mapOnly && selected) && (
          <div
            className="canvas-legend"
            aria-label={t("legend")}
            style={{
              display: "flex", flexDirection: "column", gap: 4, padding: "7px 9px",
              background: "color-mix(in srgb,#fff 92%,transparent)", border: "1px solid var(--color-divider)",
              boxShadow: "var(--shadow-md)", fontSize: 11, pointerEvents: "none",
            }}
          >
            {composition.map((c) => (
              <div key={c.kind} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ width: 18, height: 12, flex: "none", ...KIND_APPEARANCE[c.kind] }} />
                <span style={{ color: kindLabelColor(c.kind), fontFamily: "var(--font-heading)", letterSpacing: ".06em" }}>{t(`kind.${c.kind}`).toUpperCase()}</span>
                <span style={{ marginLeft: "auto", fontVariantNumeric: "tabular-nums", color: "color-mix(in srgb,var(--color-text) 55%,transparent)" }}>{c.n}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {!mapOnly && (
      <div
        className={resizingSide === "right" ? "resize-handle dragging" : "resize-handle"}
        onMouseDown={(ev) => startSidebarResize("right", ev)}
        title={t("resizePanel")}
      />
      )}

      {!mapOnly && (
      <div style={{ background: "#fff", overflow: "auto", padding: 14 }}>
        {selected ? (
          // A disabled <fieldset> greys out every input inside in one go —
          // the inspector's fields still show the selected entity's numbers,
          // they just can't be edited.
          <fieldset disabled={readOnly || effectiveMode !== "edit"} style={{ display: "flex", flexDirection: "column", gap: 11, border: 0, padding: 0, margin: 0, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
              <div>
                <div style={{ fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--color-accent)" }}>
                  {t(`kind.${selected.kind}`)}
                </div>
                <div style={{ fontFamily: "var(--font-heading)", fontSize: 24, letterSpacing: ".03em", lineHeight: 1.05 }}>
                  {selected.code}
                </div>
              </div>
              <span className="tag tag-accent">
                {selected.bays * selected.levels > 1 ? t("cellCount", { n: selected.bays * selected.levels }) : selected.isBin ? t("oneLocation") : t("areaM2", { n: Math.round(selected.widthM * selected.heightM) })}
              </span>
            </div>

            <div className="field">
              <label>{t("label")}</label>
              <input className="input" type="text" value={draft.name ?? ""} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} onBlur={() => commit({ name: draft.name })} />
            </div>
            <div className="field">
              <label>{t("locationCode")}</label>
              <input className="input" type="text" value={draft.code ?? ""} onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value }))} onBlur={() => commit({ code: draft.code })} />
            </div>

            <div>
              <div style={{ fontFamily: "var(--font-heading)", fontSize: 11, letterSpacing: ".16em", textTransform: "uppercase", color: "color-mix(in srgb,var(--color-text) 55%,transparent)", marginBottom: 7 }}>
                {t("dimensions")}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div className="field"><label>{t("width")}</label><input className="input" type="number" step="0.1" min="0.3" value={draft.widthM ?? ""} onChange={(e) => setDraft((d) => ({ ...d, widthM: e.target.value }))} onBlur={() => commit({ widthM: parseFloat(draft.widthM) })} /></div>
                <div className="field"><label>{t("depth")}</label><input className="input" type="number" step="0.1" min="0.3" value={draft.heightM ?? ""} onChange={(e) => setDraft((d) => ({ ...d, heightM: e.target.value }))} onBlur={() => commit({ heightM: parseFloat(draft.heightM) })} /></div>
                <div className="field"><label>{t("xFromWall")}</label><input className="input" type="number" step="0.1" min="0" value={draft.xM ?? ""} onChange={(e) => setDraft((d) => ({ ...d, xM: e.target.value }))} onBlur={() => commit({ xM: parseFloat(draft.xM) })} /></div>
                <div className="field"><label>{t("yFromWall")}</label><input className="input" type="number" step="0.1" min="0" value={draft.yM ?? ""} onChange={(e) => setDraft((d) => ({ ...d, yM: e.target.value }))} onBlur={() => commit({ yM: parseFloat(draft.yM) })} /></div>
              </div>
            </div>

            {LOCATION_TYPES[selected.kind as LocationKind].spatial === "store" && (
              <div>
                <div style={{ fontFamily: "var(--font-heading)", fontSize: 11, letterSpacing: ".16em", textTransform: "uppercase", color: "color-mix(in srgb,var(--color-text) 55%,transparent)", marginBottom: 7 }}>
                  {t("subdivision")}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div className="field"><label>{t("bays")}</label><input className="input" type="number" step="1" min="1" max="48" value={draft.bays ?? ""} onChange={(e) => setDraft((d) => ({ ...d, bays: e.target.value }))} onBlur={() => commit({ bays: parseInt(draft.bays, 10) })} /></div>
                  <div className="field"><label>{t("levelsCount")}</label><input className="input" type="number" step="1" min="1" max={levels.length} value={draft.levels ?? ""} onChange={(e) => setDraft((d) => ({ ...d, levels: e.target.value }))} onBlur={() => commit({ levels: parseInt(draft.levels, 10) })} /></div>
                </div>
                <div style={{ marginTop: 9, display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11 }}>
                  <span style={{ color: "color-mix(in srgb,var(--color-text) 60%,transparent)" }}>{t("occupied")}</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>{Math.round(occupancyOf(selected, locations, occupied) * 100)}%</span>
                </div>
                <div style={{ marginTop: 5, height: 6, background: "var(--color-neutral-200)" }}>
                  <div style={{ width: `${Math.round(occupancyOf(selected, locations, occupied) * 100)}%`, height: "100%", background: "var(--color-accent)" }} />
                </div>
                {selected.isBin && (
                  <Link href={`/builder/bin/${selected.id}`} className="btn btn-secondary btn-block" style={{ marginTop: 9 }}>
                    {t("viewStock")}
                  </Link>
                )}
                <Gate capability="printLabels" mode="disable">
                  <Link href={selected.isBin ? `/labels?bin=${selected.id}` : `/labels?parent=${selected.id}`} className="btn btn-secondary btn-block" style={{ marginTop: 9 }}>
                    {selected.isBin ? t("printLabel") : t("printLabels")}
                  </Link>
                </Gate>
              </div>
            )}


            {!readOnly && (
              <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
                <button className="btn btn-secondary" onClick={handleDuplicate} disabled={busy} style={{ flex: 1 }}>{t("duplicate")}</button>
                <button className="btn btn-secondary" onClick={handleDelete} disabled={busy} style={{ flex: 1 }}>{t("delete")}</button>
              </div>
            )}
          </fieldset>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 11, letterSpacing: ".16em", textTransform: "uppercase", color: "color-mix(in srgb,var(--color-text) 55%,transparent)" }}>
              {t("nothingSelected")}
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.5, color: "color-mix(in srgb,var(--color-text) 72%,transparent)" }}>
              {t("nothingSelectedBody")}
            </div>
            <Gate capability="printLabels" mode="disable">
              <Link href="/labels" className="btn btn-secondary btn-block">
                {t("printAllLabels")}
              </Link>
            </Gate>
            <div style={{ height: 1, background: "var(--color-divider)" }} />
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 11, letterSpacing: ".16em", textTransform: "uppercase", color: "color-mix(in srgb,var(--color-text) 55%,transparent)" }}>
              {t("composition")}
            </div>
            {composition.map((c) => (
              <div key={c.kind} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, paddingBottom: 6, borderBottom: "1px solid color-mix(in srgb,var(--color-text) 8%,transparent)" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                  <span style={{ width: 14, height: 10, flex: "none", ...KIND_APPEARANCE[c.kind] }} />
                  {c.label}
                </span>
                <span style={{ fontFamily: "var(--font-heading)", fontSize: 16, fontVariantNumeric: "tabular-nums", color: kindLabelColor(c.kind) }}>{c.n}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {floorOpen && (
        <div className="dialog-backdrop" style={{ position: "fixed", zIndex: 60 }}>
          <div className="dialog blueprint">
            <i className="corner tl" /><i className="corner tr" /><i className="corner bl" /><i className="corner br" />
            <div className="dialog-title">{t("floorSettingsTitle")}</div>
            <div className="dialog-body">{t("floorSettingsBody")}</div>
            <div className="field"><label>{t("facilityName")}</label><input className="input" type="text" value={floorDraft.name} onChange={(e) => setFloorDraft((d) => ({ ...d, name: e.target.value }))} /></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div className="field"><label>{t("widthM")}</label><input className="input" type="number" step="0.5" min="6" value={floorDraft.widthM} onChange={(e) => setFloorDraft((d) => ({ ...d, widthM: e.target.value }))} /></div>
              <div className="field"><label>{t("depthM")}</label><input className="input" type="number" step="0.5" min="6" value={floorDraft.heightM} onChange={(e) => setFloorDraft((d) => ({ ...d, heightM: e.target.value }))} /></div>
            </div>
            <div className="dialog-actions">
              <button className="btn btn-secondary" onClick={() => setFloorOpen(false)} style={{ flex: 1 }}>{t("cancel")}</button>
              <button className="btn btn-primary" onClick={handleFloorSave} disabled={busy} style={{ flex: 1 }}>{t("save")}</button>
            </div>
          </div>
        </div>
      )}

      {levelsOpen && (
        <div className="dialog-backdrop" style={{ position: "fixed", zIndex: 60 }} onMouseDown={(e) => { if (e.target === e.currentTarget) setLevelsOpen(false); }}>
          <div className="dialog blueprint">
            <i className="corner tl" /><i className="corner tr" /><i className="corner bl" /><i className="corner br" />
            <div className="dialog-title">{t("levels.manage")}</div>
            <div className="dialog-body">{t("levels.manageBody")}</div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {levels.map((lv) => (
                <div key={lv.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 0", borderBottom: "1px solid var(--color-divider)", fontSize: 13 }}>
                  <span>
                    <span style={{ fontFamily: "var(--font-heading)", fontSize: 15, marginRight: 8 }}>{lv.index}</span>
                    {levelName(lv)}
                    <span className="text-muted"> · {t("levels.racksOn", { n: locations.filter((l) => !l.isBin && l.levels >= lv.index && LOCATION_TYPES[l.kind as LocationKind].spatial === "store").length })}</span>
                  </span>
                  <span style={{ display: "flex", gap: 4 }}>
                    <button className="btn btn-ghost" onClick={() => handleRenameLevel(lv)} disabled={busy} style={{ fontSize: 11 }}>{t("levels.rename")}</button>
                    {lv.index === levels.length && levels.length > 1 && (
                      <button className="btn btn-ghost" onClick={handleRemoveTopLevel} disabled={busy} style={{ fontSize: 11, color: "var(--color-danger-700)" }}>{t("delete")}</button>
                    )}
                  </span>
                </div>
              ))}
            </div>
            <div className="dialog-actions">
              <button className="btn btn-secondary" onClick={() => setLevelsOpen(false)} style={{ flex: 1 }}>{t("cancel")}</button>
              <button className="btn btn-primary" onClick={handleAddLevel} disabled={busy} style={{ flex: 1 }}>{t("levels.add")}</button>
            </div>
          </div>
        </div>
      )}

      {templatesOpen && (
        <div className="dialog-backdrop" style={{ position: "fixed", zIndex: 60 }} onMouseDown={(e) => { if (e.target === e.currentTarget) setTemplatesOpen(false); }}>
          <div className="dialog blueprint">
            <i className="corner tl" /><i className="corner tr" /><i className="corner bl" /><i className="corner br" />
            <div className="dialog-title">{t("templatesButton")}</div>
            <div className="dialog-body">{locations.length > 0 ? t("templatesReplaceHint") : t("templatePrompt")}</div>
            {templateButtons}
            <div className="dialog-actions">
              <button className="btn btn-secondary" onClick={() => setTemplatesOpen(false)} style={{ flex: 1 }}>{t("cancel")}</button>
            </div>
          </div>
        </div>
      )}

      {confirmTemplate && (
        <div className="dialog-backdrop" style={{ position: "fixed", zIndex: 70 }}>
          <div className="dialog blueprint">
            <i className="corner tl" /><i className="corner tr" /><i className="corner bl" /><i className="corner br" />
            <div className="dialog-title">{t("confirmReplaceTitle")}</div>
            <div className="dialog-body">{t("confirmReplaceBody")}</div>
            <div className="dialog-actions">
              <button className="btn btn-secondary" onClick={() => setConfirmTemplate(null)} style={{ flex: 1 }}>{t("cancel")}</button>
              <button className="btn btn-primary" onClick={() => runTemplate(confirmTemplate, true)} disabled={busy} style={{ flex: 1 }}>{t("confirmReplace")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
