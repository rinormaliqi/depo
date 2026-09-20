"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useNotify } from "@/components/notifications";
import { requestNewInvite } from "./actions";

export function RequestNewInvite({ token, inviter }: { token: string; inviter: string }) {
  const t = useTranslations("invite");
  const notify = useNotify();
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  if (done) return <p style={{ fontSize: 13, marginTop: 12 }}>{t("renewSent", { inviter })}</p>;
  return (
    <button
      type="button"
      className="btn btn-primary btn-block"
      disabled={pending}
      style={{ marginTop: 12 }}
      onClick={() =>
        start(async () => {
          const r = await requestNewInvite(token);
          if ("error" in r) notify.error(r.error);
          else setDone(true);
        })
      }
    >
      {pending ? t("renewing") : t("renew", { inviter })}
    </button>
  );
}
