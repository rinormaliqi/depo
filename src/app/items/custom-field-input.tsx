"use client";

import { useTranslations } from "next-intl";
import type { FieldDefinition } from "@/lib/custom-fields";
import { MAX_FIELD_CHARS } from "@/lib/import-table";

// Shared by the edit form (items-list.tsx) and the create form
// (item-form.tsx) — one render-by-type switch, not two. `name` is what a
// native <form>'s FormData actually reads on submit; React keeps the DOM
// input's value in sync via value/onChange regardless, so this works both
// as a fully controlled field and as a plain form participant.
export function CustomFieldInput({
  def,
  value,
  onChange,
  name,
}: {
  def: FieldDefinition;
  value: string;
  onChange: (v: string) => void;
  name?: string;
}) {
  const t = useTranslations("customFields");

  if (def.type === "select") {
    return (
      <select className="input" name={name} value={value} onChange={(e) => onChange(e.target.value)} style={{ width: 140 }}>
        <option value="">{t("selectPlaceholder")}</option>
        {(def.options ?? []).map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    );
  }
  if (def.type === "boolean") {
    return (
      <select className="input" name={name} value={value} onChange={(e) => onChange(e.target.value)} style={{ width: 100 }}>
        <option value="">{t("selectPlaceholder")}</option>
        <option value="true">{t("yes")}</option>
        <option value="false">{t("no")}</option>
      </select>
    );
  }
  if (def.type === "number") {
    return <input className="input" type="number" name={name} value={value} onChange={(e) => onChange(e.target.value)} style={{ width: 120 }} />;
  }
  if (def.type === "date") {
    return <input className="input" type="date" name={name} value={value} onChange={(e) => onChange(e.target.value)} style={{ width: 150 }} />;
  }
  return <input className="input" type="text" name={name} value={value} onChange={(e) => onChange(e.target.value)} maxLength={MAX_FIELD_CHARS} style={{ width: 140 }} />;
}
