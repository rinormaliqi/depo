"use client";

import { useTranslations } from "next-intl";
import { PublicLink } from "@/components/public-link";
import { useActionState } from "react";
import { signUp } from "./actions";

export function SignupForm() {
  const t = useTranslations("auth");
  const [state, formAction, isPending] = useActionState(signUp, undefined);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="field">
        <label>{t("signup.companyName")}</label>
        <input className="input" name="companyName" placeholder={t("signup.companyPlaceholder")} required />
      </div>
      <div className="field">
        <label>{t("signup.yourName")}</label>
        <input className="input" name="name" placeholder={t("signup.namePlaceholder")} required />
      </div>
      <div className="field">
        <label>{t("email")}</label>
        <input className="input" name="email" type="email" placeholder="you@company.com" required />
      </div>
      <div className="field">
        <label>{t("password")}</label>
        <input className="input" name="password" type="password" placeholder={t("signup.passwordHint")} required minLength={8} />
      </div>
      {state?.error && <p style={{ fontSize: 13, color: "var(--color-accent-800)" }}>{state.error}</p>}
      <button type="submit" className="btn btn-primary btn-block" disabled={isPending}>
        {isPending ? t("signup.creating") : t("signup.createAccount")}
      </button>
      <p className="text-muted" style={{ fontSize: 11, textAlign: "center", margin: 0 }}>
        {t.rich("signup.agree", {
          terms: (chunks) => <PublicLink href="/terms" target="_blank" style={{ color: "var(--color-accent)" }}>{chunks}</PublicLink>,
          refunds: (chunks) => <PublicLink href="/refunds" target="_blank" style={{ color: "var(--color-accent)" }}>{chunks}</PublicLink>,
          privacy: (chunks) => <PublicLink href="/privacy" target="_blank" style={{ color: "var(--color-accent)" }}>{chunks}</PublicLink>,
        })}
      </p>
    </form>
  );
}
