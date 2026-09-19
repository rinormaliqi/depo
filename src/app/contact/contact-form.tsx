"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, useState } from "react";
import { FormError } from "@/components/form-error";
import { useNotify } from "@/components/notifications";
import { sendContactMessage } from "./actions";

// The public contact form. Success and non-field errors go through the
// notification system; the honeypot and the fill-time stamp are the only
// anti-spam, on purpose — see actions.ts.
export function ContactForm({ defaults }: { defaults?: { name?: string; email?: string } }) {
  const t = useTranslations("public.contact.form");
  const notify = useNotify();
  const [state, formAction, isPending] = useActionState(sendContactMessage, undefined);
  const form = useRef<HTMLFormElement>(null);
  const [startedAt] = useState(() => Date.now());

  useEffect(() => {
    if (!state?.ok) return;
    notify.success(t("sent"), { title: t("sentTitle") });
    form.current?.reset();
  }, [state?.ok, state?.at, notify, t]);

  return (
    <form ref={form} action={formAction} className="contact-form">
      <input type="hidden" name="startedAt" value={startedAt} />
      {/* Honeypot: invisible to people, irresistible to bots. */}
      <div className="contact-hp" aria-hidden="true">
        <label htmlFor="contact-website">Website</label>
        <input id="contact-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="contact-form-row">
        <div className="field">
          <label htmlFor="contact-name">{t("name")}</label>
          <input id="contact-name" className="input" name="name" type="text" required defaultValue={defaults?.name} autoComplete="name" />
        </div>
        <div className="field">
          <label htmlFor="contact-company">{t("company")}</label>
          <input id="contact-company" className="input" name="company" type="text" autoComplete="organization" />
        </div>
      </div>
      <div className="field">
        <label htmlFor="contact-email">{t("email")}</label>
        <input id="contact-email" className="input" name="email" type="email" required defaultValue={defaults?.email} autoComplete="email" />
      </div>
      <div className="field">
        <label htmlFor="contact-message">{t("message")}</label>
        <textarea id="contact-message" className="input" name="message" rows={6} required placeholder={t("messagePlaceholder")} />
      </div>
      <FormError>{state?.error}</FormError>
      <button type="submit" className="btn btn-primary" disabled={isPending}>
        {isPending ? t("sending") : t("send")}
      </button>
    </form>
  );
}
