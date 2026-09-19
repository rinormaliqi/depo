"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LocationKind } from "@/db/schema";
import { LOCATION_TYPES, TEMPLATE_KEYS, type TemplateKey } from "@/lib/blueprint-types";
import { getBlueprint, type LocationRow } from "./actions";
import * as rawActions from "./actions";
import { unwrap } from "@/lib/action-result";
import { useNotify } from "@/components/notifications";
import { Gate } from "@/components/capabilities";

const addSector = unwrap(rawActions.addSector);
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
type Box = { xM: number; yM: number; widthM: number; heightM: number };

type Drag =
  | { kind: "move"; id: string; pointerStart: { x: number; y: number }; origin: Box }
  | { kind: "resize"; id: string; pointerStart: { x: number; y: number }; origin: Box };

const PALETTE_KINDS: LocationKind[] = [
  "zone",
  "aisle",
  "rack",
  "platform",
  "pallet",
  "bin",
  "dock",
  "wall",
];

// A distinct look per kind, styled after architectural drafting conventions
// (different hatch/fill per material or fixture type, solid poché for
// walls) rather than one generic box — so the floor plan reads as an actual
// depot layout, not an undifferentiated grid of rectangles. Shared between
// the palette swatches and the canvas so the palette doubles as a legend.
const KIND_APPEARANCE: Record<LocationKind, React.CSSProperties> = {
  zone: {
    border: "1px dashed var(--color-accent-500)",
    background: "transparent",
  },
  aisle: {
    border: "1px dashed var(--color-accent-500)",
    background:
      "repeating-linear-gradient(45deg,transparent 0 7px,color-mix(in srgb,var(--color-text) 5%,transparent) 7px 8px)",
  },
  // Shelving frame: a light tint with heavy end-posts (the vertical steel
  // uprights a real pallet rack is bolted to), thin top/bottom rails.
  rack: {
    borderTop: "1px solid var(--color-accent-700)",
    borderBottom: "1px solid var(--color-accent-700)",
    borderLeft: "4px solid var(--color-accent-700)",
    borderRight: "4px solid var(--color-accent-700)",
    background: "var(--color-neutral-100)",
  },
  // Raised deck: a fine crosshatch suggesting a grated/plated platform
  // surface, distinct from a rack's solid shelf tint.
  platform: {
    border: "1px solid var(--color-accent-600)",
    background:
      "repeating-linear-gradient(0deg,transparent 0 5px,color-mix(in srgb,var(--color-accent-600) 9%,transparent) 5px 6px)," +
      "repeating-linear-gradient(90deg,transparent 0 5px,color-mix(in srgb,var(--color-accent-600) 9%,transparent) 5px 6px)",
  },
  // Three deck boards, top-down — the classic pallet silhouette.
  pallet: {
    border: "1px solid var(--color-accent-500)",
    backgroundColor: "var(--color-neutral-100)",
    backgroundImage:
      "linear-gradient(var(--color-neutral-400) 0 18%,transparent 18% 41%,var(--color-neutral-400) 41% 59%,transparent 59% 82%,var(--color-neutral-400) 82% 100%)",
  },
  // A small container: a nested inset border, like a tote sitting in its slot.
  bin: {
    border: "1px solid var(--color-accent-400)",
    background: "#fff",
    boxShadow: "inset 0 0 0 3px var(--color-bg), inset 0 0 0 4px var(--color-accent-300)",
  },
  // Fixture, accent-tinted hatch — a loading door, not a structural wall.
  dock: {
    border: "1px solid var(--color-accent-600)",
    background:
      "repeating-linear-gradient(-45deg,transparent 0 5px,color-mix(in srgb,var(--color-accent-600) 16%,transparent) 5px 6px)",
  },
  // Structural walls are drawn solid (poché), same as on a real blueprint —
  // the one kind that's genuinely impassable, so it reads as solid, not hollow.
  wall: {
    border: "1px solid var(--color-neutral-900)",
    background: "var(--color-neutral-800)",
  },
};

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

function defaultPosition(count: number) {
  return { x: 1 + (count % 8) * 1.5, y: 1 + Math.floor(count / 8) * 1.5 };
}

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
  initialHighlightBinId,
  readOnly = false,
}: {
  facility: Facility;
  initialLocations: LocationRow[];
  initialOccupiedBinIds: string[];
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedLevel, setSelectedLevel] = useState<number | "all">("all");
  const [zoom, setZoom] = useState(0.8);
  const [grid, setGrid] = useState(true);
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
  const maxLevels = useMemo(() => Math.max(1, ...locations.map((l) => l.levels)), [locations]);

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

  async function handleAdd(kind: LocationKind) {
    setBusy(true);
    try {
      const pos = defaultPosition(locations.length);
      const created = await createEntity(facility.id, kind, pos.x, pos.y);
      await reload();
      setSelectedId(created.id);
      pushUndo(makeCreateUndoEntry(specOf(created), created.id));
    } catch (e) {
      notify.error(e instanceof Error ? e.message : t("error.couldntAdd"));
    } finally {
      setBusy(false);
    }
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
    ev.stopPropagation();
    ev.preventDefault();
    setSelectedId(entity.id);
    if (readOnly) return;
    dragRef.current = {
      kind,
      id: entity.id,
      pointerStart: pointFromEvent(ev),
      origin: { xM: entity.xM, yM: entity.yM, widthM: entity.widthM, heightM: entity.heightM },
    } as Drag;
  }

  useEffect(() => {
    function onMove(ev: MouseEvent) {
      const d = dragRef.current;
      if (!d) return;
      setLocalOverride((o) => ({ ...o, [d.id]: computeDragBox(d, ev) }));
    }
    function onUp(ev: MouseEvent) {
      const d = dragRef.current;
      if (!d) return;
      dragRef.current = null;
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

  useEffect(() => {
    function isEditableTarget(el: EventTarget | null) {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
    }
    function onKeyDown(ev: KeyboardEvent) {
      if (isEditableTarget(ev.target)) return;
      if (floorOpen || templatesOpen || confirmTemplate) return;
      if (readOnly) return;
      const meta = ev.metaKey || ev.ctrlKey;
      const key = ev.key.toLowerCase();
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
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
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
    <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: `${leftWidth}px 6px minmax(360px,1fr) 6px ${rightWidth}px` }}>
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
              {t("entitiesHint")}
            </div>
          )}

          {!readOnly && PALETTE_KINDS.map((kind) => {
            const type = LOCATION_TYPES[kind];
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

      <div
        className={resizingSide === "left" ? "resize-handle dragging" : "resize-handle"}
        onMouseDown={(ev) => startSidebarResize("left", ev)}
        title={t("resizePanel")}
      />

      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", background: "var(--color-bg)" }}>
        <div style={{ flex: "none", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 7, padding: "7px 11px", background: "#fff", borderBottom: "1px solid var(--color-divider)" }}>
          <button className="btn btn-secondary" onClick={() => setZoom((z) => Math.max(0.2, Math.round((z - 0.1) * 10) / 10))} style={{ minWidth: 26, padding: "1px 7px" }}>−</button>
          <span style={{ fontSize: 11, fontVariantNumeric: "tabular-nums", minWidth: 36, textAlign: "center" }}>{Math.round(zoom * 100)}%</span>
          <button className="btn btn-secondary" onClick={() => setZoom((z) => Math.min(2, Math.round((z + 0.1) * 10) / 10))} style={{ minWidth: 26, padding: "1px 7px" }}>+</button>
          <button className="btn btn-secondary" onClick={fit} style={{ padding: "1px 8px", fontSize: 11, letterSpacing: ".08em" }}>{t("zoomFit")}</button>
          <button className="btn btn-ghost" onClick={() => setGrid((g) => !g)} style={{ fontSize: 11, letterSpacing: ".08em" }}>{grid ? t("gridOn") : t("gridOff")}</button>

          <div style={{ width: 1, height: 17, background: "var(--color-divider)" }} />
          {!readOnly && (
            <>
              <button className="btn btn-secondary" onClick={handleUndo} disabled={busy || undoStack.current.length === 0} title={t("undo")} style={{ minWidth: 26, padding: "1px 7px" }}>↺</button>
              <button className="btn btn-secondary" onClick={handleRedo} disabled={busy || redoStack.current.length === 0} title={t("redo")} style={{ minWidth: 26, padding: "1px 7px" }}>↻</button>
            </>
          )}

          {maxLevels > 1 && (
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
                {Array.from({ length: maxLevels }, (_, i) => i + 1).map((lv) => (
                  <button
                    key={lv}
                    className="seg-opt"
                    onClick={() => setSelectedLevel(lv)}
                    style={{ background: selectedLevel === lv ? "var(--color-accent)" : undefined, color: selectedLevel === lv ? "var(--color-bg)" : undefined, fontSize: 11 }}
                  >
                    {lv}
                  </button>
                ))}
              </div>
            </>
          )}
          {status && <span style={{ fontSize: 11, color: "var(--color-accent-700)", marginLeft: 8 }}>{status}</span>}
        </div>

        <div ref={wrapRef} style={{ flex: 1, minHeight: 0, position: "relative", overflow: "auto" }} onMouseDown={(e) => { if (e.target === e.currentTarget) setSelectedId(null); }}>
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
              onMouseDown={(e) => { if (e.target === e.currentTarget) setSelectedId(null); }}
            >
              {topLevel.length === 0 && (
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, textAlign: "center", padding: 20 }}>
                  <div style={{ fontFamily: "var(--font-heading)", fontSize: 21, letterSpacing: ".08em", color: "var(--color-accent-700)", pointerEvents: "none" }}>{t("emptyFloorTitle")}</div>
                  <div style={{ fontSize: 13, maxWidth: 320, color: "color-mix(in srgb,var(--color-text) 60%,transparent)", pointerEvents: "none" }}>
                    {readOnly ? t("emptyFloorBodyReadOnly") : t("emptyFloorBody")}
                  </div>
                  {!readOnly && (
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
                    <div
                      onMouseDown={(ev) => startDrag("move", ev, e)}
                      style={{
                        position: "absolute", left: 0, top: -3, transform: "translateY(-100%)",
                        display: "flex", alignItems: "baseline", gap: 3,
                        fontFamily: "var(--font-heading)", fontSize: type.spatial === "area" ? 11 : 9,
                        letterSpacing: type.spatial === "area" ? ".14em" : ".1em", whiteSpace: "nowrap",
                        color: type.spatial === "area" ? "var(--color-accent-700)" : "color-mix(in srgb,var(--color-text) 62%,transparent)",
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
                        style={{ position: "absolute", right: -5, bottom: -5, width: 10, height: 10, background: "var(--color-accent)", cursor: "nwse-resize", zIndex: 9 }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div
        className={resizingSide === "right" ? "resize-handle dragging" : "resize-handle"}
        onMouseDown={(ev) => startSidebarResize("right", ev)}
        title={t("resizePanel")}
      />

      <div style={{ background: "#fff", overflow: "auto", padding: 14 }}>
        {selected ? (
          // A disabled <fieldset> greys out every input inside in one go —
          // the inspector's fields still show the selected entity's numbers,
          // they just can't be edited.
          <fieldset disabled={readOnly} style={{ display: "flex", flexDirection: "column", gap: 11, border: 0, padding: 0, margin: 0, minWidth: 0 }}>
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
                  <div className="field"><label>{t("levels")}</label><input className="input" type="number" step="1" min="1" max="4" value={draft.levels ?? ""} onChange={(e) => setDraft((d) => ({ ...d, levels: e.target.value }))} onBlur={() => commit({ levels: parseInt(draft.levels, 10) })} /></div>
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
                <span style={{ fontSize: 13 }}>{c.label}</span>
                <span style={{ fontFamily: "var(--font-heading)", fontSize: 16, fontVariantNumeric: "tabular-nums" }}>{c.n}</span>
              </div>
            ))}
          </div>
        )}
      </div>

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
