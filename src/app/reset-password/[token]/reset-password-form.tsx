"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { resetPassword } from "./actions";
import { FormError } from "@/components/form-error";

export function ResetPasswordForm({ token }: { token: string }) {
  const t = useTranslations("resetPassword");
  const [state, formAction, isPending] = useActionState(resetPassword, undefined);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <input type="hidden" name="token" value={token} />
      <div className="field">
        <label>{t("newPassword")}</label>
        <input className="input" name="password" type="password" placeholder={t("passwordHint")} required minLength={8} />
      </div>
      <FormError>{state?.error}</FormError>
      <button type="submit" className="btn btn-primary btn-block" disabled={isPending}>
        {isPending ? t("resetting") : t("resetButton")}
      </button>
    </form>
  );
}
