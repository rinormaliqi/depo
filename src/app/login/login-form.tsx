"use client";

import { useTranslations } from "next-intl";
import { PublicLink } from "@/components/public-link";
import { useActionState } from "react";
import { login } from "./actions";

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
      {state?.error && <p style={{ fontSize: 13, color: "var(--color-accent-800)" }}>{state.error}</p>}
      <button type="submit" className="btn btn-primary btn-block" disabled={isPending}>
        {isPending ? t("login.signingIn") : t("login.signIn")}
      </button>
    </form>
  );
}
