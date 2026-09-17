"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import * as builderActions from "@/app/builder/actions";
import { unwrap } from "@/lib/action-result";

const createFacility = unwrap(builderActions.createFacility);

type Facility = { id: string; name: string };

// Replaces the static facility name in AppHeader once the org has (or
// can have) more than one facility. Self-fetching like the billing pill,
// so the ~7 pages rendering AppHeader don't each need to load the list.
export function FacilitySwitcher({ currentId, currentName }: { currentId: string; currentName: string }) {
  const t = useTranslations("facility");
  const router = useRouter();
  const [all, setAll] = useState<Facility[] | null>(null);
  const [canAdd, setCanAdd] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Re-fetched whenever the current facility changes (a switch or an add
  // both refresh the page with a new currentId), so the list stays true.
  useEffect(() => {
    builderActions
      .getMyFacilities()
      .then(({ facilities, canAdd }) => {
        setAll(facilities);
        setCanAdd(canAdd);
      })
      .catch(() => {});
  }, [currentId]);

  const NEW = "__new__";

  function onChange(value: string) {
    setError(null);
    if (value === NEW) {
      const name = window.prompt(t("newPrompt"));
      if (!name?.trim()) return;
      startTransition(async () => {
        try {
          await createFacility(name);
          router.refresh();
        } catch (e) {
          setError(e instanceof Error ? e.message : t("error"));
        }
      });
      return;
    }
    if (value === currentId) return;
    startTransition(async () => {
      await builderActions.switchFacility(value);
      router.refresh();
    });
  }

  const single = !all || (all.length <= 1 && !canAdd);
  if (single) {
    return <span>{currentName}</span>;
  }

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", minWidth: 0 }}>
      <select
        className="facility-select"
        value={currentId}
        disabled={pending}
        onChange={(e) => onChange(e.target.value)}
        aria-label={t("switch")}
        style={{
          font: "inherit", fontFamily: "var(--font-heading)", fontSize: 15, letterSpacing: ".04em",
          border: 0, background: "transparent", padding: 0, cursor: "pointer", maxWidth: "100%",
          color: "inherit",
        }}
      >
        {all.map((f) => (
          <option key={f.id} value={f.id}>{f.name}</option>
        ))}
        {canAdd && <option value={NEW}>{t("addNew")}</option>}
      </select>
      {error && <span style={{ fontSize: 10, color: "var(--color-accent-800)", whiteSpace: "normal" }}>{error}</span>}
    </span>
  );
}
