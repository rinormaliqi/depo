"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createLocation, getChildren, type LocationRow } from "./actions";

type Crumb = { id: string | null; name: string };

export function LocationBuilder({
  facilityId,
  facilityName,
  initialLocations,
}: {
  facilityId: string;
  facilityName: string;
  initialLocations: LocationRow[];
}) {
  const router = useRouter();
  const [path, setPath] = useState<Crumb[]>([{ id: null, name: facilityName }]);
  const [children, setChildren] = useState<LocationRow[]>(initialLocations);
  const [isPending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"section" | "bin">("section");
  const [error, setError] = useState<string | null>(null);

  const currentParentId = path[path.length - 1].id;

  function loadChildren(parentId: string | null) {
    startTransition(async () => {
      const rows = await getChildren(facilityId, parentId);
      setChildren(rows);
    });
  }

  function enter(location: LocationRow) {
    if (location.isBin) {
      router.push(`/builder/bin/${location.id}`);
      return;
    }
    setPath((p) => [...p, { id: location.id, name: location.name }]);
    loadChildren(location.id);
  }

  function jumpTo(index: number) {
    setPath((p) => p.slice(0, index + 1));
    loadChildren(path[index].id);
  }

  function cancelAdd() {
    setAdding(false);
    setError(null);
    setName("");
    setKind("section");
  }

  async function handleAdd() {
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a name first");
      return;
    }
    startTransition(async () => {
      try {
        const created = await createLocation(
          facilityId,
          currentParentId,
          trimmed,
          kind === "bin",
        );
        setChildren((c) => [...c, created]);
        cancelAdd();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <nav className="mb-6 flex flex-wrap items-center gap-1 overflow-x-auto text-sm">
        {path.map((crumb, i) => (
          <span key={crumb.id ?? "root"} className="flex items-center gap-1">
            {i > 0 && <span className="text-neutral-400">/</span>}
            <button
              onClick={() => jumpTo(i)}
              disabled={i === path.length - 1}
              className="rounded px-2 py-1 text-neutral-600 hover:bg-neutral-100 disabled:font-medium disabled:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:disabled:text-neutral-100"
            >
              {crumb.name}
            </button>
          </span>
        ))}
      </nav>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {children.map((loc) => (
          <button
            key={loc.id}
            onClick={() => enter(loc)}
            className={`flex h-24 flex-col items-center justify-center gap-1 rounded-xl border p-3 text-center ${
              loc.isBin
                ? "border-dashed border-neutral-300 hover:border-neutral-400 dark:border-neutral-700 dark:hover:border-neutral-500"
                : "border-neutral-200 hover:border-neutral-400 dark:border-neutral-800 dark:hover:border-neutral-600"
            }`}
          >
            <span className="text-sm font-medium">{loc.name}</span>
            <span className="text-xs text-neutral-500">{loc.isBin ? "Bin ›" : "Section ›"}</span>
          </button>
        ))}

        {adding ? (
          <div className="flex flex-col gap-2 rounded-xl border border-neutral-300 p-3 dark:border-neutral-700">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder="Name"
              className="rounded border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            />
            <div className="flex gap-1">
              <button
                onClick={() => setKind("section")}
                className={`flex-1 rounded px-2 py-1 text-xs ${
                  kind === "section"
                    ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                    : "border border-neutral-300 dark:border-neutral-700"
                }`}
              >
                Section
              </button>
              <button
                onClick={() => setKind("bin")}
                className={`flex-1 rounded px-2 py-1 text-xs ${
                  kind === "bin"
                    ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                    : "border border-neutral-300 dark:border-neutral-700"
                }`}
              >
                Bin
              </button>
            </div>
            {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
            <div className="flex gap-1">
              <button
                onClick={handleAdd}
                disabled={isPending}
                className="flex-1 rounded bg-neutral-900 px-2 py-1 text-xs text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
              >
                Save
              </button>
              <button
                onClick={cancelAdd}
                className="flex-1 rounded border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="flex h-24 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-neutral-300 text-neutral-400 hover:border-neutral-400 hover:text-neutral-600 dark:border-neutral-700 dark:hover:border-neutral-500"
          >
            <span className="text-xl">+</span>
            <span className="text-xs">Add</span>
          </button>
        )}
      </div>

      {children.length === 0 && !adding && (
        <p className="mt-6 text-center text-sm text-neutral-400">
          Nothing here yet — add a section or bin to get started.
        </p>
      )}
    </div>
  );
}
