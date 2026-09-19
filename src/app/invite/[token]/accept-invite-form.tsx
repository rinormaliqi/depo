"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { acceptInviteAsExistingUser, acceptInviteAsNewUser } from "./actions";
import { FormError } from "@/components/form-error";

export function AcceptInviteForm({ token, isExistingUser }: { token: string; isExistingUser: boolean }) {
  const t = useTranslations("invite");
  const action = isExistingUser ? acceptInviteAsExistingUser : acceptInviteAsNewUser;
  const [state, formAction, isPending] = useActionState(action, undefined);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <input type="hidden" name="token" value={token} />

      {!isExistingUser && (
        <div className="field">
          <label>{t("yourName")}</label>
          <input className="input" name="name" placeholder={t("yourNamePlaceholder")} required />
        </div>
      )}

      <div className="field">
        <label>{t("password")}</label>
        <input
          className="input"
          name="password"
          type="password"
          placeholder={isExistingUser ? t("passwordExistingHint") : t("passwordNewHint")}
          required
          minLength={isExistingUser ? undefined : 8}
        />
      </div>

      <FormError>{state?.error}</FormError>

      <button type="submit" className="btn btn-primary btn-block" disabled={isPending}>
        {isPending ? t("joining") : isExistingUser ? t("acceptExisting") : t("acceptNew")}
      </button>
    </form>
  );
}
