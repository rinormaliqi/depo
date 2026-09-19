"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect } from "react";
import { useNotify } from "@/components/notifications";
import { resendVerification } from "./actions";
import { FormError } from "@/components/form-error";

export function ResendForm() {
  const t = useTranslations("verifyEmail");
  const [state, formAction, isPending] = useActionState(() => resendVerification(), undefined);
  const notify = useNotify();
  useEffect(() => {
    if (state?.sent) notify.success(t("resent"));
  }, [state, notify, t]);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <FormError>{state?.error}</FormError>
      <button type="submit" className="btn btn-secondary btn-block" disabled={isPending}>
        {isPending ? t("resending") : t("resend")}
      </button>
    </form>
  );
}
