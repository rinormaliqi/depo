"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { FormError } from "@/components/form-error";
import { useNotify } from "@/components/notifications";
import { changeEmail } from "./actions";

// "Wrong address?" — collapsed until asked for, so the common case (the
// mail is on its way) stays a one-button page.
export function ChangeEmailForm({ currentEmail }: { currentEmail: string }) {
  const t = useTranslations("verifyEmail.change");
  const notify = useNotify();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(changeEmail, undefined);

  useEffect(() => {
    if (state?.changedTo) {
      notify.success(t("changed", { email: state.changedTo }));
      setOpen(false);
      router.refresh(); // the page's "we sent a link to …" line shows the new address
    }
  }, [state?.changedTo, state?.at, notify, t, router]);

  if (!open) {
    return (
      <p className="text-muted" style={{ fontSize: 13, textAlign: "center", margin: "12px 0 0" }}>
        {t("prompt")}{" "}
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(true)} style={{ padding: 0, fontSize: 13, color: "var(--color-accent)" }}>
          {t("open")}
        </button>
      </p>
    );
  }

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14, padding: 12, border: "1px solid var(--color-divider)", background: "#fff" }}>
      <div className="field">
        <label htmlFor="new-email">{t("label")}</label>
        <input id="new-email" className="input" name="email" type="email" required defaultValue={currentEmail} autoComplete="email" />
      </div>
      <FormError>{state?.error}</FormError>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)} style={{ flex: 1 }}>{t("cancel")}</button>
        <button type="submit" className="btn btn-primary" disabled={isPending} style={{ flex: 1 }}>{isPending ? t("saving") : t("save")}</button>
      </div>
    </form>
  );
}
