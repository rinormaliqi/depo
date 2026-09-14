"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { requestPasswordReset } from "./actions";

export function ForgotPasswordForm() {
  const t = useTranslations("forgotPassword");
  const [state, formAction, isPending] = useActionState(requestPasswordReset, undefined);

  if (state?.sent) {
    return <p style={{ fontSize: 14 }}>{t("sent")}</p>;
  }

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="field">
        <label>{t("emailLabel")}</label>
        <input className="input" name="email" type="email" placeholder="you@company.com" required />
      </div>
      {state?.error && <p style={{ fontSize: 13, color: "var(--color-accent-800)" }}>{state.error}</p>}
      <button type="submit" className="btn btn-primary btn-block" disabled={isPending}>
        {isPending ? t("sending") : t("sendLink")}
      </button>
    </form>
  );
}
