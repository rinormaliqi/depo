"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef } from "react";
import { useNotify } from "@/components/notifications";
import { createItem } from "./actions";
import { FormError } from "@/components/form-error";
import { MAX_FIELD_CHARS } from "@/lib/import-table";

export function ItemForm() {
  const t = useTranslations("items");
  const [state, formAction, isPending] = useActionState(createItem, undefined);
  const notify = useNotify();
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state?.created) return;
    notify.success(t("created", { name: state.created.name }));
    form.current?.reset();
    form.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, [state?.created, notify, t]);

  return (
    <form ref={form} action={formAction} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
      <input className="input" name="name" maxLength={MAX_FIELD_CHARS} placeholder={t("namePlaceholder")} required style={{ width: 160 }} />
      <input className="input" name="unitOfMeasure" maxLength={MAX_FIELD_CHARS} placeholder={t("unitPlaceholder")} required style={{ width: 160 }} />
      <input className="input" name="sku" maxLength={MAX_FIELD_CHARS} placeholder={t("skuPlaceholder")} style={{ width: 140 }} />
      <input className="input" name="category" maxLength={MAX_FIELD_CHARS} placeholder={t("categoryPlaceholder")} style={{ width: 160 }} />
      <FormError>{state?.error}</FormError>
      <button type="submit" className="btn btn-primary" disabled={isPending}>
        {isPending ? t("adding") : t("addItem")}
      </button>
    </form>
  );
}
