// A depot that already runs on a location list — zones, racks, bays,
// levels in a spreadsheet — shouldn't be redrawn by hand. Pure like
// src/lib/import-items.ts: text → rows + errors; the server action in
// src/app/builder/import/actions.ts resolves parents against the floor and
// writes. Columns: code, kind, parent (a zone's code), x, y, width, depth
// (metres, all four or none — without them the object is laid out
// automatically inside its parent), bays, levels (store kinds only).

import { locationKinds, type LocationKind } from "@/db/schema";
import { LOCATION_TYPES, round2, type Box } from "@/lib/blueprint-types";
import { MAX_FIELD_CHARS, parseTable, type Delimiter, type TableSpec } from "@/lib/import-table";

export const LOCATION_COLUMNS = ["code", "kind", "parent", "x", "y", "width", "depth", "bays", "levels"] as const;
export type LocationColumn = (typeof LOCATION_COLUMNS)[number];

export type LocationRowImport = {
  line: number;
  code: string;
  kind: LocationKind;
  parent: string | null;
  box: Box | null;
  bays: number;
  levels: number;
};

export type LocationImportErrorCode =
  | "codeMissing"
  | "kindInvalid"
  | "binNotImportable"
  | "positionPartial"
  | "numberInvalid"
  | "baysInvalid"
  | "levelsInvalid"
  | "duplicateCode"
  | "tooLong"
  | "tooManyRows"
  | "empty"
  // From the server, once resolved against the floor:
  | "codeExists"
  | "parentUnknown"
  | "parentNotZone"
  | "levelsBeyondFacility";
export type LocationImportError = { line: number; code: LocationImportErrorCode; field?: LocationColumn; value?: string };

export type ParsedLocations = { rows: LocationRowImport[]; errors: LocationImportError[]; delimiter: Delimiter; hasHeader: boolean };

// The kinds a list can name. Spreadsheets are written by people, so the
// English kind names, their Albanian equivalents and a few common
// synonyms all resolve. Bins are never imported directly — they are the
// bays a rack generates.
const KIND_ALIASES: Record<string, LocationKind> = {
  zone: "zone", zona: "zone", zonë: "zone", sector: "zone", sektor: "zone", sektori: "zone",
  aisle: "aisle", korridor: "aisle", korridori: "aisle", hallway: "aisle",
  rack: "rack", raft: "rack", rafti: "rack", shelf: "rack", shelving: "rack", raftim: "rack",
  platform: "platform", platformë: "platform", platforme: "platform", platforma: "platform", deck: "platform",
  pallet: "pallet", paletë: "pallet", palete: "pallet", paleta: "pallet",
  dock: "dock", dok: "dock", doku: "dock", "loading dock": "dock",
  wall: "wall", mur: "wall", muri: "wall",
  door: "door", derë: "door", dere: "door", dera: "door", entrance: "door", hyrje: "door", hyrja: "door",
  exit: "exit", dalje: "exit", dalja: "exit", "emergency exit": "exit", "dalje emergjente": "exit",
  window: "window", dritare: "window", dritarja: "window",
  vent: "vent", ventilim: "vent", ventilimi: "vent", ventilation: "vent",
  pillar: "pillar", shtyllë: "pillar", shtylle: "pillar", shtylla: "pillar", column: "pillar", kolonë: "pillar", kolona: "pillar",
};

export function parseKind(cell: string): LocationKind | null {
  const key = cell.trim().toLowerCase().replace(/\s+/g, " ");
  if ((locationKinds as readonly string[]).includes(key)) return key as LocationKind;
  return KIND_ALIASES[key] ?? null;
}

// "8", "8,5", "8.5", " 12 " are metres; "", "abc", "-1" are not.
export function parseMetres(cell: string): number | null {
  const s = cell.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? round2(n) : null;
}

function parseCount(cell: string, max: number): number | null {
  const s = cell.trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return n >= 1 && n <= max ? n : null;
}

const SPEC: TableSpec<LocationColumn> = {
  columns: LOCATION_COLUMNS,
  aliases: {
    code: ["code", "kodi", "kod", "location", "lokacioni", "vendndodhja", "id", "label", "etiketa"],
    kind: ["kind", "type", "lloji", "tipi", "lloj", "tip"],
    parent: ["parent", "zone", "zona", "prind", "prindi", "sector", "sektori", "in", "ne"],
    x: ["x", "x m", "x (m)", "left", "majtas"],
    y: ["y", "y m", "y (m)", "top", "siper", "lart"],
    width: ["width", "w", "gjeresia", "gjerësia", "gjeresi", "width m", "length", "gjatesia"],
    depth: ["depth", "height", "h", "d", "thellesia", "thellësia", "thellesi", "depth m"],
    bays: ["bays", "bay", "hapesira", "hapësira", "hapesirat", "slots", "positions", "pozita"],
    levels: ["levels", "level", "nivele", "nivelet", "tiers", "kate", "katet"],
  },
};

export const MAX_IMPORT_BAYS = 48;
export const MAX_IMPORT_LEVELS = 8;

export function parseLocationsText(text: string): ParsedLocations {
  const table = parseTable(text, SPEC);
  if (!table.ok) {
    return { rows: [], errors: [{ line: table.line, code: table.error }], delimiter: table.delimiter, hasHeader: table.hasHeader };
  }

  const rows: LocationRowImport[] = [];
  const errors: LocationImportError[] = [];
  const seen = new Map<string, number>();

  for (const { line, cells } of table.records) {
    let ok = true;
    const code = cells.code.trim().toUpperCase();
    if (!code) { errors.push({ line, code: "codeMissing" }); ok = false; }
    for (const field of ["code", "parent"] as const) {
      if (cells[field].length > MAX_FIELD_CHARS) { errors.push({ line, code: "tooLong", field, value: cells[field].slice(0, 30) + "…" }); ok = false; }
    }

    const kind = parseKind(cells.kind);
    if (!kind) { errors.push({ line, code: "kindInvalid", value: cells.kind }); ok = false; }
    else if (kind === "bin") { errors.push({ line, code: "binNotImportable" }); ok = false; }

    const parent = cells.parent.trim().toUpperCase() || null;

    const posCells = [cells.x, cells.y, cells.width, cells.depth];
    const given = posCells.filter((c) => c.trim() !== "").length;
    let box: Box | null = null;
    if (given === 4) {
      const [x, y, w, h] = posCells.map(parseMetres);
      if (x === null || y === null || w === null || h === null || w < 0.3 || h < 0.3) {
        const bad = (["x", "y", "width", "depth"] as const)[posCells.findIndex((c, i) => [x, y, w, h][i] === null)] ?? "width";
        errors.push({ line, code: "numberInvalid", field: bad, value: cells[bad] });
        ok = false;
      } else {
        box = { xM: x, yM: y, widthM: w, heightM: h };
      }
    } else if (given > 0) {
      errors.push({ line, code: "positionPartial" });
      ok = false;
    }

    const type = kind ? LOCATION_TYPES[kind] : null;
    let bays = type?.bays ?? 1;
    let levels = type?.levels ?? 1;
    if (type?.spatial === "store") {
      if (cells.bays.trim()) {
        const n = parseCount(cells.bays, MAX_IMPORT_BAYS);
        if (n === null) { errors.push({ line, code: "baysInvalid", value: cells.bays }); ok = false; } else bays = n;
      }
      if (cells.levels.trim()) {
        const n = parseCount(cells.levels, MAX_IMPORT_LEVELS);
        if (n === null) { errors.push({ line, code: "levelsInvalid", value: cells.levels }); ok = false; } else levels = n;
      }
    } else {
      bays = 1;
      levels = 1;
    }

    if (code) {
      const first = seen.get(code);
      if (first !== undefined) { errors.push({ line, code: "duplicateCode", value: code }); ok = false; }
      else seen.set(code, line);
    }

    if (ok && kind) rows.push({ line, code, kind, parent, box, bays, levels });
  }
  return { rows, errors, delimiter: table.delimiter, hasHeader: table.hasHeader };
}

// Rows that came without a position are laid out one after another inside
// their container — left to right, then a new row — at each kind's default
// size (a rack as wide as its bays), with real picking-aisle clearance
// between rows. Not a floor plan anyone would ship, but every object lands
// on the floor, inside the right zone, ready to be dragged into place.
const ROW_GAP = 1.8;
const ITEM_GAP = 1.0;
const BAY_WIDTH = 1.1;

export function defaultSize(kind: LocationKind, bays: number): { widthM: number; heightM: number } {
  const type = LOCATION_TYPES[kind];
  if (type.spatial === "store" && bays > 1) return { widthM: round2(Math.max(type.w * 0.5, bays * BAY_WIDTH)), heightM: type.h };
  return { widthM: type.w, heightM: type.h };
}

export function autoLayout<T extends { kind: LocationKind; bays: number }>(items: T[], container: Box, inset = 0.6): (T & { box: Box })[] {
  const out: (T & { box: Box })[] = [];
  let x = container.xM + inset;
  let y = container.yM + inset;
  let rowH = 0;
  const right = container.xM + container.widthM - inset;
  for (const item of items) {
    const size = defaultSize(item.kind, item.bays);
    if (x + size.widthM > right + 1e-9 && x > container.xM + inset + 1e-9) {
      x = container.xM + inset;
      y = round2(y + rowH + ROW_GAP);
      rowH = 0;
    }
    // A container too short for another row: the object is kept inside its
    // bottom edge (overlapping the row above) rather than pushed off the
    // floor, where it couldn't even be seen to be dragged back.
    const yM = Math.max(container.yM + inset, Math.min(y, container.yM + container.heightM - inset - size.heightM));
    out.push({ ...item, box: { xM: round2(x), yM: round2(yM), widthM: size.widthM, heightM: size.heightM } });
    x = round2(x + size.widthM + ITEM_GAP);
    rowH = Math.max(rowH, size.heightM);
  }
  return out;
}

export function locationsImportTemplate(): string {
  return [
    "code;kind;parent;x;y;width;depth;bays;levels",
    "A;zone;;1;1;14;9;;",
    "A-01;rack;A;2;2;8;1.2;8;2",
    "A-02;rack;A;;;;;6;1",
    "B;zone;;16;1;7;9;;",
    "B-P1;platform;B;;;;;4;1",
    "D1;dock;;10;15.7;3.4;2.6;;",
    "",
  ].join("\r\n");
}
