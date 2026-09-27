"use client";

import { useTranslations } from "next-intl";
import type { FieldDefinition } from "@/lib/custom-fields";

// The one "narrow this list by a custom field's value" control, shared by
// items, the scanner's item picker and stock search — a select/boolean
// field gets an exact-match dropdown, everything else a contains-text
// input. Picking a different field always clears the value: an old text
// filter surviving a switch to a select field would just show nothing.
export function CustomFieldFilterBar({
  fieldDefs,
  fieldId,
  value,
  onFieldChange,
  onValueChange,
}: {
  fieldDefs: Pick<FieldDefinition, "id" | "label" | "type" | "options">[];
  fieldId: string;
  value: string;
  onFieldChange: (fieldId: string) => void;
  onValueChange: (value: string) => void;
}) {
  const t = useTranslations("customFields");
  if (fieldDefs.length === 0) return null;
  const field = fieldDefs.find((f) => f.id === fieldId);

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", fontSize: 12 }}>
      <span className="text-muted">{t("filterLabel")}</span>
      <select
        className="input"
        value={fieldId}
        onChange={(e) => {
          onFieldChange(e.target.value);
          onValueChange("");
        }}
        style={{ width: 160 }}
      >
        <option value="">{t("filterAll")}</option>
        {fieldDefs.map((f) => (
          <option key={f.id} value={f.id}>{f.label}</option>
        ))}
      </select>
      {field?.type === "select" && (
        <select className="input" value={value} onChange={(e) => onValueChange(e.target.value)} style={{ width: 160 }}>
          <option value="">{t("selectPlaceholder")}</option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      )}
      {field?.type === "boolean" && (
        <select className="input" value={value} onChange={(e) => onValueChange(e.target.value)} style={{ width: 120 }}>
          <option value="">{t("selectPlaceholder")}</option>
          <option value="true">{t("yes")}</option>
          <option value="false">{t("no")}</option>
        </select>
      )}
      {field && field.type !== "select" && field.type !== "boolean" && (
        <input className="input" value={value} onChange={(e) => onValueChange(e.target.value)} placeholder={t("filterValuePlaceholder")} style={{ width: 180 }} />
      )}
    </div>
  );
}

// Pure predicate behind the bar above: does this one raw stored value pass
// the current field/value filter? Exact match for select/boolean (their
// value input is already a dropdown of exact choices), case-insensitive
// "contains" for everything else — a no-op (matches everything) once the
// field itself is cleared.
export function matchesCustomFieldFilter(
  raw: string | undefined,
  field: Pick<FieldDefinition, "type"> | undefined,
  filterValue: string,
): boolean {
  if (!field) return true;
  if (field.type === "select" || field.type === "boolean") return raw === filterValue;
  const needle = filterValue.trim().toLowerCase();
  if (!needle) return true;
  return (raw ?? "").toLowerCase().includes(needle);
}
