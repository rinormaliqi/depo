"use client";

import { useTranslations } from "next-intl";
import { PublicLink } from "@/components/public-link";
import { useActionState } from "react";
import { login } from "./actions";
import { FormError } from "@/components/form-error";

export function LoginForm() {
  const t = useTranslations("auth");
  const [state, formAction, isPending] = useActionState(login, undefined);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="field">
        <label>{t("email")}</label>
        <input className="input" name="email" type="email" placeholder="you@company.com" required />
      </div>
      <div className="field">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
          <label style={{ display: "block", marginBottom: 0, fontSize: 12, color: "color-mix(in srgb, var(--color-text) 70%, transparent)" }}>
            {t("password")}
          </label>
          <PublicLink href="/forgot-password" style={{ fontSize: 12, color: "var(--color-accent)" }}>
            {t("login.forgotPassword")}
          </PublicLink>
        </div>
        <input className="input" name="password" type="password" placeholder="••••••••" required />
      </div>
      <FormError>{state?.error}</FormError>
      {state?.error && !state.googleOnly && (
        <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>
          {t("login.afterFailure")}{" "}
          <PublicLink href="/forgot-password" style={{ color: "var(--color-accent)" }}>{t("login.forgotPassword")}</PublicLink>
        </p>
      )}
      <button type="submit" className="btn btn-primary btn-block" disabled={isPending}>
        {isPending ? t("login.signingIn") : t("login.signIn")}
      </button>
    </form>
  );
}
