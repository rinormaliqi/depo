"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import { useConfirm, useNotify } from "@/components/notifications";
import { CustomFieldFilterBar, matchesCustomFieldFilter } from "@/components/custom-field-filter";
import { unwrap } from "@/lib/action-result";
import * as rawActions from "./actions";
import * as customFieldActions from "./custom-fields-actions";
import type { ItemPatch, ItemWithStock } from "./actions";
import type { FieldDefinition } from "@/lib/custom-fields";
import { MAX_FIELD_CHARS } from "@/lib/import-table";

const updateItem = unwrap(rawActions.updateItem);
const deleteItem = unwrap(rawActions.deleteItem);
const setItemCustomValues = unwrap(customFieldActions.setItemCustomValues);

type CustomValues = Record<string, Record<string, string>>;

function displayValue(def: FieldDefinition, raw: string, t: ReturnType<typeof useTranslations>): string {
  if (def.type === "boolean") return raw === "true" ? t("yes") : t("no");
  return raw;
}

// The catalogue as rows that open into a one-line form: a typo is fixed
// where it's seen, and an item that never got used can be removed. The
// server says no when it can't (stock on the floor, movements in the
// history) — the button stays, the toast explains.
export function ItemsList({
  items,
  canManage,
  fieldDefs,
  customValues,
}: {
  items: ItemWithStock[];
  canManage: boolean;
  fieldDefs: FieldDefinition[];
  customValues: CustomValues;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [filterFieldId, setFilterFieldId] = useState("");
  const [filterValue, setFilterValue] = useState("");

  const filterField = fieldDefs.find((f) => f.id === filterFieldId);
  const visibleItems = useMemo(() => {
    if (!filterField) return items;
    return items.filter((item) => matchesCustomFieldFilter(customValues[item.id]?.[filterField.id], filterField, filterValue));
  }, [items, customValues, filterField, filterValue]);

  return (
    <div>
      <div style={{ marginTop: 12 }}>
        <CustomFieldFilterBar fieldDefs={fieldDefs} fieldId={filterFieldId} value={filterValue} onFieldChange={setFilterFieldId} onValueChange={setFilterValue} />
      </div>

      <div style={{ marginTop: 12, display: "flex", flexDirection: "column" }}>
        {visibleItems.map((item) =>
          editing === item.id ? (
            <ItemEditor
              key={item.id}
              item={item}
              fieldDefs={fieldDefs}
              values={customValues[item.id] ?? {}}
              onDone={() => setEditing(null)}
            />
          ) : (
            <ItemRow key={item.id} item={item} canManage={canManage} fieldDefs={fieldDefs} values={customValues[item.id] ?? {}} onEdit={() => setEditing(item.id)} />
          ),
        )}
      </div>
    </div>
  );
}

function ItemRow({
  item,
  canManage,
  fieldDefs,
  values,
  onEdit,
}: {
  item: ItemWithStock;
  canManage: boolean;
  fieldDefs: FieldDefinition[];
  values: Record<string, string>;
  onEdit: () => void;
}) {
  const t = useTranslations("items");
  const tf = useTranslations("customFields");
  const notify = useNotify();
  const confirm = useConfirm();
  const [isPending, startTransition] = useTransition();

  async function remove() {
    const ok = await confirm({ title: t("deleteTitle", { name: item.name }), body: t("deleteBody"), confirmLabel: t("delete"), danger: true });
    if (!ok) return;
    startTransition(async () => {
      await notify.run(() => deleteItem(item.id), { success: t("deleted", { name: item.name }) });
    });
  }

  const customSummary = fieldDefs
    .map((f) => (values[f.id] ? `${f.label}: ${displayValue(f, values[f.id], tf)}` : null))
    .filter((s): s is string => s !== null)
    .join(" · ");

  return (
    <div
      style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "2px 12px", padding: "8px 0", borderBottom: "1px solid var(--color-divider)", fontSize: 13 }}
    >
      <span style={{ flex: "1 1 200px" }}>
        {item.name}
        {item.sku && (
          <span className="text-muted" style={{ marginLeft: 8, fontSize: 12 }}>
            {item.sku}
          </span>
        )}
      </span>
      <span className="text-muted" style={{ fontSize: 12 }}>
        {item.unitOfMeasure}
        {item.category ? ` · ${item.category}` : ""}
        {item.inStock > 0 ? ` · ${t("stockNote", { count: item.inStock })}` : ""}
        {customSummary ? ` · ${customSummary}` : ""}
      </span>
      {canManage && (
        <span style={{ display: "flex", gap: 4 }}>
          <button type="button" className="btn btn-ghost" onClick={onEdit} style={{ fontSize: 11 }}>
            {t("edit")}
          </button>
          <button type="button" className="btn btn-ghost" onClick={remove} disabled={isPending} style={{ fontSize: 11, color: "var(--color-danger-500)" }}>
            {t("delete")}
          </button>
        </span>
      )}
    </div>
  );
}

function CustomFieldInput({
  def,
  value,
  onChange,
}: {
  def: FieldDefinition;
  value: string;
  onChange: (v: string) => void;
}) {
  const t = useTranslations("customFields");

  if (def.type === "select") {
    return (
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)} style={{ width: 140 }}>
        <option value="">{t("selectPlaceholder")}</option>
        {(def.options ?? []).map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    );
  }
  if (def.type === "boolean") {
    return (
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)} style={{ width: 100 }}>
        <option value="">{t("selectPlaceholder")}</option>
        <option value="true">{t("yes")}</option>
        <option value="false">{t("no")}</option>
      </select>
    );
  }
  if (def.type === "number") {
    return <input className="input" type="number" value={value} onChange={(e) => onChange(e.target.value)} style={{ width: 120 }} />;
  }
  if (def.type === "date") {
    return <input className="input" type="date" value={value} onChange={(e) => onChange(e.target.value)} style={{ width: 150 }} />;
  }
  return <input className="input" type="text" value={value} onChange={(e) => onChange(e.target.value)} maxLength={MAX_FIELD_CHARS} style={{ width: 140 }} />;
}

function ItemEditor({
  item,
  fieldDefs,
  values,
  onDone,
}: {
  item: ItemWithStock;
  fieldDefs: FieldDefinition[];
  values: Record<string, string>;
  onDone: () => void;
}) {
  const t = useTranslations("items");
  const notify = useNotify();
  const [isPending, startTransition] = useTransition();
  const [patch, setPatch] = useState<ItemPatch>({ name: item.name, unitOfMeasure: item.unitOfMeasure, sku: item.sku ?? "", category: item.category ?? "" });
  const [customDraft, setCustomDraft] = useState<Record<string, string>>(() => Object.fromEntries(fieldDefs.map((f) => [f.id, values[f.id] ?? ""])));
  const set = (key: keyof ItemPatch) => (e: React.ChangeEvent<HTMLInputElement>) => setPatch((p) => ({ ...p, [key]: e.target.value }));

  function save() {
    startTransition(async () => {
      const done = await notify.run(
        async () => {
          await updateItem(item.id, patch);
          if (fieldDefs.length > 0) await setItemCustomValues(item.id, customDraft);
        },
        { success: t("updated", { name: patch.name.trim() }) },
      );
      if (done !== undefined) onDone();
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      style={{ display: "flex", flexDirection: "column", gap: 6, padding: "8px 0", borderBottom: "1px solid var(--color-divider)" }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <input className="input" value={patch.name} onChange={set("name")} maxLength={MAX_FIELD_CHARS} placeholder={t("namePlaceholder")} required autoFocus style={{ width: 160 }} />
        <input className="input" value={patch.unitOfMeasure} onChange={set("unitOfMeasure")} maxLength={MAX_FIELD_CHARS} placeholder={t("unitPlaceholder")} required style={{ width: 120 }} />
        <input className="input" value={patch.sku} onChange={set("sku")} maxLength={MAX_FIELD_CHARS} placeholder={t("skuPlaceholder")} style={{ width: 120 }} />
        <input className="input" value={patch.category} onChange={set("category")} maxLength={MAX_FIELD_CHARS} placeholder={t("categoryPlaceholder")} style={{ width: 140 }} />
      </div>
      {fieldDefs.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          {fieldDefs.map((f) => (
            <label key={f.id} style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11 }}>
              <span className="text-muted">{f.label}{f.required ? " *" : ""}</span>
              <CustomFieldInput def={f} value={customDraft[f.id] ?? ""} onChange={(v) => setCustomDraft((d) => ({ ...d, [f.id]: v }))} />
            </label>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" className="btn btn-primary" disabled={isPending}>
          {isPending ? t("saving") : t("save")}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDone} disabled={isPending}>
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}
