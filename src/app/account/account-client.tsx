"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useConfirm, useNotify } from "@/components/notifications";
import { unwrap } from "@/lib/action-result";
import * as raw from "./actions";

const updateName = unwrap(raw.updateName);
const changePassword = unwrap(raw.changePassword);
const requestEmailChange = unwrap(raw.requestEmailChange);

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section style={{ background: "#fff", border: "1px solid var(--color-divider)", padding: 16, marginTop: 14 }}>
      <div style={{ fontFamily: "var(--font-heading)", fontSize: 13, letterSpacing: ".12em", textTransform: "uppercase", marginBottom: 4 }}>{title}</div>
      {hint && <p className="text-muted" style={{ fontSize: 12, margin: "0 0 12px", lineHeight: 1.5 }}>{hint}</p>}
      {children}
    </section>
  );
}

export function AccountClient({ name, email, hasPassword, organizations }: { name: string; email: string; hasPassword: boolean; organizations: { name: string; role: string }[] }) {
  const t = useTranslations("account");
  const notify = useNotify();
  const confirm = useConfirm();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [nameDraft, setNameDraft] = useState(name);
  const [emailDraft, setEmailDraft] = useState("");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [next2, setNext2] = useState("");

  async function run<T>(fn: () => Promise<T>, success: string) {
    setBusy(true);
    const r = await notify.run(fn, { success });
    setBusy(false);
    return r;
  }

  return (
    <div>
      <Section title={t("profile.title")}>
        <form
          onSubmit={async (e) => { e.preventDefault(); if (await run(() => updateName(nameDraft), t("profile.saved")) !== undefined) router.refresh(); }}
          style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}
        >
          <div className="field" style={{ flex: "1 1 200px" }}>
            <label htmlFor="acc-name">{t("profile.name")}</label>
            <input id="acc-name" className="input" value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} required autoComplete="name" />
          </div>
          <button className="btn btn-primary" disabled={busy || nameDraft.trim() === name}>{t("save")}</button>
        </form>
      </Section>

      <Section title={t("email.title")} hint={t("email.hint", { email })}>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await run(() => requestEmailChange(emailDraft), t("email.sent", { email: emailDraft.trim().toLowerCase() }));
            if (r !== undefined) setEmailDraft("");
          }}
          style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}
        >
          <div className="field" style={{ flex: "1 1 200px" }}>
            <label htmlFor="acc-email">{t("email.new")}</label>
            <input id="acc-email" className="input" type="email" value={emailDraft} onChange={(e) => setEmailDraft(e.target.value)} required autoComplete="email" />
          </div>
          <button className="btn btn-primary" disabled={busy || !emailDraft.trim()}>{t("email.send")}</button>
        </form>
      </Section>

      <Section title={t("password.title")} hint={hasPassword ? t("password.hintHas") : t("password.hintNone")}>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (next !== next2) { notify.warning(t("password.mismatch")); return; }
            const r = await run(() => changePassword(hasPassword ? current : undefined, next), t("password.saved"));
            if (r !== undefined) { setCurrent(""); setNext(""); setNext2(""); router.refresh(); }
          }}
          style={{ display: "flex", flexDirection: "column", gap: 8 }}
        >
          {hasPassword && (
            <div className="field">
              <label htmlFor="acc-current">{t("password.current")}</label>
              <input id="acc-current" className="input" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" />
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div className="field">
              <label htmlFor="acc-next">{t("password.new")}</label>
              <input id="acc-next" className="input" type="password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} autoComplete="new-password" />
            </div>
            <div className="field">
              <label htmlFor="acc-next2">{t("password.repeat")}</label>
              <input id="acc-next2" className="input" type="password" value={next2} onChange={(e) => setNext2(e.target.value)} required minLength={8} autoComplete="new-password" />
            </div>
          </div>
          <button className="btn btn-primary" disabled={busy || !next} style={{ alignSelf: "flex-start" }}>{hasPassword ? t("password.change") : t("password.set")}</button>
        </form>
      </Section>

      <Section title={t("sessions.title")} hint={t("sessions.hint")}>
        <form action={raw.signOutEverywhere}>
          <button className="btn btn-secondary" disabled={busy}>{t("sessions.signOutEverywhere")}</button>
        </form>
      </Section>

      <Section title={t("danger.title")} hint={t("danger.hint")}>
        {organizations.length > 0 && (
          <ul style={{ margin: "0 0 12px", paddingLeft: 18, fontSize: 13 }}>
            {organizations.map((o) => (
              <li key={o.name}>{o.name} · {t(`role.${o.role}`)}</li>
            ))}
          </ul>
        )}
        <button
          className="btn btn-danger"
          disabled={busy}
          onClick={async () => {
            const typed = await confirm({ title: t("danger.confirmTitle"), body: t("danger.confirmBody"), confirmLabel: t("danger.confirm"), danger: true, input: { label: t("danger.typeToConfirm"), placeholder: email, required: true } });
            if (typed === null) return;
            if (typed.trim().toLowerCase() !== email.toLowerCase()) { notify.warning(t("danger.typedMismatch")); return; }
            setBusy(true);
            const r = await raw.deleteAccount();
            setBusy(false);
            if (r && "error" in r && r.error) notify.error(r.error);
          }}
        >
          {t("danger.delete")}
        </button>
      </Section>
    </div>
  );
}
