"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useState } from "react";
import { FormError } from "@/components/form-error";
import { useNotify } from "@/components/notifications";
import { resendVerification } from "./actions";

const COOLDOWN_SECONDS = 60;

export function ResendForm() {
  const t = useTranslations("verifyEmail");
  const [state, formAction, isPending] = useActionState(() => resendVerification(), undefined);
  const notify = useNotify();
  const [left, setLeft] = useState(0);

  // The server enforces the 60-second floor; the countdown just makes the
  // wait visible instead of a surprise error.
  useEffect(() => {
    if (state?.sent) {
      notify.success(t("resent"));
      setLeft(COOLDOWN_SECONDS);
    }
  }, [state, notify, t]);
  useEffect(() => {
    if (left <= 0) return;
    const id = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [left]);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <FormError>{state?.error}</FormError>
      <button type="submit" className="btn btn-secondary btn-block" disabled={isPending || left > 0}>
        {isPending ? t("resending") : left > 0 ? t("resendIn", { s: left }) : t("resend")}
      </button>
    </form>
  );
}
