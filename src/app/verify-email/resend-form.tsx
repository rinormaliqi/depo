"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { resendVerification } from "./actions";

export function ResendForm() {
  const t = useTranslations("verifyEmail");
  const [state, formAction, isPending] = useActionState(() => resendVerification(), undefined);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {state?.sent && <p style={{ fontSize: 13 }}>{t("resent")}</p>}
      {state?.error && <p style={{ fontSize: 13, color: "var(--color-accent-800)" }}>{state.error}</p>}
      <button type="submit" className="btn btn-secondary btn-block" disabled={isPending}>
        {isPending ? t("resending") : t("resend")}
      </button>
    </form>
  );
}
