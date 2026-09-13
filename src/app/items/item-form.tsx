"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { createItem } from "./actions";

export function ItemForm() {
  const t = useTranslations("items");
  const [state, formAction, isPending] = useActionState(createItem, undefined);

  return (
    <form action={formAction} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
      <input className="input" name="name" placeholder={t("namePlaceholder")} required style={{ width: 160 }} />
      <input className="input" name="unitOfMeasure" placeholder={t("unitPlaceholder")} required style={{ width: 160 }} />
      <input className="input" name="sku" placeholder={t("skuPlaceholder")} style={{ width: 140 }} />
      <input className="input" name="category" placeholder={t("categoryPlaceholder")} style={{ width: 160 }} />
      {state?.error && <p style={{ width: "100%", fontSize: 13, color: "var(--color-accent-800)" }}>{state.error}</p>}
      <button type="submit" className="btn btn-primary" disabled={isPending}>
        {isPending ? t("adding") : t("addItem")}
      </button>
    </form>
  );
}
