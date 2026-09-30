"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, useState } from "react";
import { useNotify } from "@/components/notifications";
import { createItem } from "./actions";
import { CustomFieldInput } from "./custom-field-input";
import { FormError } from "@/components/form-error";
import type { FieldDefinition } from "@/lib/custom-fields";
import { MAX_FIELD_CHARS } from "@/lib/import-table";

export function ItemForm({ fieldDefs }: { fieldDefs: FieldDefinition[] }) {
  const t = useTranslations("items");
  const [state, formAction, isPending] = useActionState(createItem, undefined);
  const notify = useNotify();
  const form = useRef<HTMLFormElement>(null);
  const [customDraft, setCustomDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!state?.created) return;
    notify.success(t("created", { name: state.created.name }));
    form.current?.reset();
    form.current?.querySelector<HTMLInputElement>("input")?.focus();
    setCustomDraft({});
  }, [state?.created, notify, t]);

  return (
    <form ref={form} action={formAction} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
        <input className="input" name="name" maxLength={MAX_FIELD_CHARS} defaultValue={state?.values?.name} placeholder={t("namePlaceholder")} required style={{ width: 160 }} />
        <input className="input" name="unitOfMeasure" maxLength={MAX_FIELD_CHARS} defaultValue={state?.values?.unitOfMeasure} placeholder={t("unitPlaceholder")} required style={{ width: 160 }} />
        <input className="input" name="sku" maxLength={MAX_FIELD_CHARS} defaultValue={state?.values?.sku} placeholder={t("skuPlaceholder")} style={{ width: 140 }} />
        <input className="input" name="category" maxLength={MAX_FIELD_CHARS} defaultValue={state?.values?.category} placeholder={t("categoryPlaceholder")} style={{ width: 160 }} />
        <FormError>{state?.error}</FormError>
        <button type="submit" className="btn btn-primary" disabled={isPending}>
          {isPending ? t("adding") : t("addItem")}
        </button>
      </div>
      {fieldDefs.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          {fieldDefs.map((f) => (
            <label key={f.id} style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11 }}>
              <span className="text-muted">{f.label}{f.required ? " *" : ""}</span>
              <CustomFieldInput def={f} name={`custom_${f.id}`} value={customDraft[f.id] ?? ""} onChange={(v) => setCustomDraft((d) => ({ ...d, [f.id]: v }))} />
            </label>
          ))}
        </div>
      )}
    </form>
  );
}
