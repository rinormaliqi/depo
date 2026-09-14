"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { createInvite, getTeam, resendInvite, revokeInvite } from "./actions";

type TeamData = Awaited<ReturnType<typeof getTeam>>;
type Member = TeamData["members"][number];
type PendingInvite = TeamData["pendingInvites"][number];

const ROLES = ["worker", "manager", "admin"] as const;

function InviteLink({ token }: { token: string }) {
  const t = useTranslations("team");
  const [copied, setCopied] = useState(false);

  async function copy() {
    const url = `${window.location.origin}/invite/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API unavailable — nothing to fall back to here.
    }
  }

  return (
    <button className="btn btn-ghost" onClick={copy} style={{ fontSize: 11 }}>
      {copied ? t("linkCopied") : t("copyLink")}
    </button>
  );
}

function PendingInviteRow({ invite, canManage }: { invite: PendingInvite; canManage: boolean }) {
  const t = useTranslations("team");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle(action: (id: string) => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action(invite.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("error.notAuthorized"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: "8px 0", borderBottom: "1px solid var(--color-divider)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 13 }}>
        <span>{invite.email}</span>
        <span className="tag tag-outline">{t(`role.${invite.role}`)}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 4 }}>
        <span style={{ fontSize: 11, color: "color-mix(in srgb,var(--color-text) 55%,transparent)" }}>
          {t("expires", { date: new Date(invite.expiresAt).toLocaleDateString() })}
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          <InviteLink token={invite.token} />
          {canManage && (
            <>
              <button className="btn btn-ghost" disabled={busy} onClick={() => handle(resendInvite)} style={{ fontSize: 11 }}>
                {t("resend")}
              </button>
              <button className="btn btn-ghost" disabled={busy} onClick={() => handle(revokeInvite)} style={{ fontSize: 11, color: "var(--color-accent-800)" }}>
                {t("revoke")}
              </button>
            </>
          )}
        </div>
      </div>
      {error && <p style={{ fontSize: 11, color: "var(--color-accent-800)", marginTop: 4 }}>{error}</p>}
    </div>
  );
}

export function TeamClient({
  members,
  pendingInvites,
  canManage,
  myUserId,
}: {
  members: Member[];
  pendingInvites: PendingInvite[];
  canManage: boolean;
  myUserId: string;
}) {
  const t = useTranslations("team");
  const [state, formAction, isPending] = useActionState(createInvite, undefined);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {canManage && (
        <div>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 13, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 10 }}>
            {t("invite")}
          </div>
          <form action={formAction} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div className="field" style={{ flex: "1 1 220px" }}>
              <label>{t("emailLabel")}</label>
              <input className="input" name="email" type="email" placeholder="name@company.com" required />
            </div>
            <div className="field" style={{ width: 140 }}>
              <label>{t("roleLabel")}</label>
              <select className="input" name="role" defaultValue="worker">
                {ROLES.map((r) => (
                  <option key={r} value={r}>{t(`role.${r}`)}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn btn-primary" disabled={isPending}>
              {isPending ? t("inviting") : t("sendInvite")}
            </button>
          </form>
          {state?.error && <p style={{ fontSize: 13, color: "var(--color-accent-800)", marginTop: 6 }}>{state.error}</p>}
        </div>
      )}

      <div>
        <div style={{ fontFamily: "var(--font-heading)", fontSize: 13, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 10 }}>
          {t("members", { n: members.length })}
        </div>
        {members.map((m) => (
          <div key={m.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 0", borderBottom: "1px solid var(--color-divider)", fontSize: 13 }}>
            <span>
              {m.name}{" "}
              <span style={{ color: "color-mix(in srgb,var(--color-text) 55%,transparent)" }}>· {m.email}</span>
              {m.userId === myUserId && <span style={{ color: "var(--color-accent)" }}> ({t("you")})</span>}
            </span>
            <span className="tag tag-outline">{t(`role.${m.role}`)}</span>
          </div>
        ))}
      </div>

      {pendingInvites.length > 0 && (
        <div>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 13, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 10 }}>
            {t("pending", { n: pendingInvites.length })}
          </div>
          {pendingInvites.map((invite) => (
            <PendingInviteRow key={invite.id} invite={invite} canManage={canManage} />
          ))}
        </div>
      )}
    </div>
  );
}
