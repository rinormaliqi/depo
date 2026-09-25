"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { createCompany } from "./actions";
import { FormError } from "@/components/form-error";

export function CompanyForm() {
  const t = useTranslations("welcome");
  const [state, formAction, isPending] = useActionState(createCompany, undefined);
  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="field">
        <label>{t("companyName")}</label>
        <input className="input" name="companyName" type="text" placeholder={t("companyPlaceholder")} required autoFocus defaultValue={state?.values?.companyName} />
      </div>
      <FormError>{state?.error}</FormError>
      <button type="submit" className="btn btn-primary btn-block" disabled={isPending}>
        {isPending ? t("creating") : t("create")}
      </button>
    </form>
  );
}
