"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { createCompany } from "./actions";

export function CompanyForm() {
  const t = useTranslations("welcome");
  const [state, formAction, isPending] = useActionState(createCompany, undefined);
  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="field">
        <label>{t("companyName")}</label>
        <input className="input" name="companyName" type="text" placeholder={t("companyPlaceholder")} required autoFocus />
      </div>
      {state?.error && <p style={{ fontSize: 13, color: "var(--color-accent-800)" }}>{state.error}</p>}
      <button type="submit" className="btn btn-primary btn-block" disabled={isPending}>
        {isPending ? t("creating") : t("create")}
      </button>
    </form>
  );
}
