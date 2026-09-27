"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import * as rawActions from "./custom-fields-actions";
import type { FieldDefinition } from "@/lib/custom-fields";
import type { CustomFieldType } from "@/db/schema";
import { unwrap } from "@/lib/action-result";
import { useConfirm, useNotify } from "@/components/notifications";
import { MAX_FIELD_CHARS } from "@/lib/import-table";

const createField = unwrap(rawActions.createField);
const updateField = unwrap(rawActions.updateField);
const deleteField = unwrap(rawActions.deleteField);

const TYPES: CustomFieldType[] = ["text", "number", "date", "select", "boolean"];

// Admin/manager-only panel for defining the org's own item fields — every
// item's edit form (ItemEditor in items-list.tsx) renders one input per row
// this produces. Kept collapsed by default: most days nobody needs to
// touch it, and the catalog above is the reason someone opened this page.
export function CustomFieldsManager({ fields }: { fields: FieldDefinition[] }) {
  const t = useTranslations("customFields");
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <div style={{ marginBottom: 16, border: "1px solid var(--color-divider)" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="btn btn-ghost"
        style={{ width: "100%", display: "flex", justifyContent: "space-between", fontSize: 12 }}
      >
        <span>{t("title")}</span>
        <span>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>{t("intro")}</p>
          {fields.length === 0 && <p className="text-muted" style={{ fontSize: 12 }}>{t("noFields")}</p>}
          {fields.map((f) => (
            <FieldRow key={f.id} field={f} onChanged={() => router.refresh()} />
          ))}
          <NewFieldForm onCreated={() => router.refresh()} />
        </div>
      )}
    </div>
  );
}

function FieldRow({ field, onChanged }: { field: FieldDefinition; onChanged: () => void }) {
  const t = useTranslations("customFields");
  const notify = useNotify();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(field.label);
  const [options, setOptions] = useState((field.options ?? []).join("\n"));
  const [required, setRequired] = useState(field.required);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const done = await notify.run(
      () => updateField(field.id, { label, required, options: field.type === "select" ? options.split("\n") : undefined }),
      { success: t("updated", { label }) },
    );
    setBusy(false);
    if (done !== undefined) setEditing(false);
  }

  async function remove() {
    const ok = await confirm({ title: t("deleteTitle", { label: field.label }), body: t("deleteBody"), confirmLabel: t("delete"), danger: true });
    if (!ok) return;
    setBusy(true);
    await notify.run(() => deleteField(field.id), { success: t("deleted", { label: field.label }) });
    setBusy(false);
    onChanged();
  }

  if (!editing) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "4px 0", borderBottom: "1px solid var(--color-divider)" }}>
        <span style={{ flex: 1 }}>
          {field.label}
          <span className="text-muted" style={{ marginLeft: 6 }}>
            {t(`type.${field.type}`)}
            {field.required ? ` · ${t("requiredLabel")}` : ""}
          </span>
        </span>
        <button type="button" className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => setEditing(true)}>{t("edit")}</button>
        <button type="button" className="btn btn-ghost" style={{ fontSize: 11, color: "var(--color-danger-500)" }} onClick={remove} disabled={busy}>{t("delete")}</button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "flex-start", padding: "6px 0", borderBottom: "1px solid var(--color-divider)" }}>
      <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={MAX_FIELD_CHARS} style={{ width: 160 }} />
      {field.type === "select" && (
        <textarea className="input" value={options} onChange={(e) => setOptions(e.target.value)} placeholder={t("optionsPlaceholder")} rows={3} style={{ width: 180, fontFamily: "inherit" }} />
      )}
      <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
        <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
        {t("requiredLabel")}
      </label>
      <button type="button" className="btn btn-primary" style={{ fontSize: 11 }} onClick={save} disabled={busy}>{busy ? t("saving") : t("save")}</button>
      <button type="button" className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => setEditing(false)} disabled={busy}>{t("cancel")}</button>
    </div>
  );
}

function NewFieldForm({ onCreated }: { onCreated: () => void }) {
  const t = useTranslations("customFields");
  const notify = useNotify();
  const [label, setLabel] = useState("");
  const [type, setType] = useState<CustomFieldType>("text");
  const [options, setOptions] = useState("");
  const [required, setRequired] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    const done = await notify.run(
      () => createField({ label, type, required, options: type === "select" ? options.split("\n") : undefined }),
      { success: t("created", { label }) },
    );
    setBusy(false);
    if (done === undefined) return;
    setLabel("");
    setOptions("");
    setRequired(false);
    onCreated();
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "flex-start", paddingTop: 6 }}
    >
      <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={MAX_FIELD_CHARS} placeholder={t("labelPlaceholder")} required style={{ width: 160 }} />
      <select className="input" value={type} onChange={(e) => setType(e.target.value as CustomFieldType)} style={{ width: 140 }}>
        {TYPES.map((ty) => (
          <option key={ty} value={ty}>{t(`type.${ty}`)}</option>
        ))}
      </select>
      {type === "select" && (
        <textarea className="input" value={options} onChange={(e) => setOptions(e.target.value)} placeholder={t("optionsPlaceholder")} rows={3} style={{ width: 180, fontFamily: "inherit" }} />
      )}
      <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
        <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
        {t("requiredLabel")}
      </label>
      <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? t("saving") : t("addField")}</button>
    </form>
  );
}
