import type { locations } from "@/db/schema";

type LocationRow = typeof locations.$inferSelect;

// Walks parentId up to build "ZONE · RACK · BIN" style breadcrumbs from a
// preloaded lookup map — callers fetch all of a facility's locations once
// and pass the map in, rather than each label triggering its own queries.
export function locationLabel(id: string | null, byId: Map<string, LocationRow>): string {
  if (!id) return "—";
  let cur = byId.get(id) ?? null;
  if (!cur) return "—";
  const parts: string[] = [];
  while (cur) {
    parts.unshift(cur.code ?? cur.name);
    cur = cur.parentId ? (byId.get(cur.parentId) ?? null) : null;
  }
  return parts.join(" · ");
}
