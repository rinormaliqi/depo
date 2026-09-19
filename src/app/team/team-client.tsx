"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { formatDate } from "@/lib/format-date";
import { createInvite, getTeam } from "./actions";
import * as rawActions from "./actions";
import { unwrap } from "@/lib/action-result";
import { FormError } from "@/components/form-error";
import { useConfirm, useNotify } from "@/components/notifications";

const revokeInvite = unwrap(rawActions.revokeInvite);
const resendInvite = unwrap(rawActions.resendInvite);
const changeMemberRole = unwrap(rawActions.changeMemberRole);
const removeMember = unwrap(rawActions.removeMember);

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
  const notify = useNotify();
  const expired = new Date(invite.expiresAt).getTime() < Date.now();

  async function handle(action: (id: string) => Promise<void>, success: string) {
    setBusy(true);
    await notify.run(() => action(invite.id), { success, error: t("error.notAuthorized") });
    setBusy(false);
  }

  return (
    <div style={{ padding: "8px 0", borderBottom: "1px solid var(--color-divider)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 13 }}>
        <span>{invite.email}</span>
        <span className="tag tag-outline">{t(`role.${invite.role}`)}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 4 }}>
        <span style={{ fontSize: 11, color: expired ? "var(--color-accent-800)" : "color-mix(in srgb,var(--color-text) 55%,transparent)" }}>
          {expired ? t("expired", { date: formatDate(invite.expiresAt) }) : t("expires", { date: formatDate(invite.expiresAt) })}
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          <InviteLink token={invite.token} />
          {canManage && (
            <>
              <button className="btn btn-ghost" disabled={busy} onClick={() => handle(resendInvite, t("resent", { email: invite.email }))} style={{ fontSize: 11 }}>
                {t("resend")}
              </button>
              <button className="btn btn-ghost" disabled={busy} onClick={() => handle(revokeInvite, t("revoked", { email: invite.email }))} style={{ fontSize: 11, color: "var(--color-accent-800)" }}>
                {t("revoke")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function MemberRow({
  member,
  isMe,
  canManage,
  isAdmin,
}: {
  member: Member;
  isMe: boolean;
  canManage: boolean;
  isAdmin: boolean;
}) {
  const t = useTranslations("team");
  const [busy, setBusy] = useState(false);
  const notify = useNotify();
  const confirm = useConfirm();

  // Mirrors the server's rules so the controls only appear where they'd
  // work: managers can't touch admins, nobody removes themselves.
  const editable = canManage && !isMe && (isAdmin || member.role !== "admin");

  async function run(action: () => Promise<void>, success: string) {
    setBusy(true);
    await notify.run(action, { success, error: t("error.notAuthorized") });
    setBusy(false);
  }

  return (
    <div style={{ padding: "8px 0", borderBottom: "1px solid var(--color-divider)", fontSize: 13 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
          {member.name}{" "}
          <span style={{ color: "color-mix(in srgb,var(--color-text) 55%,transparent)" }}>· {member.email}</span>
          {isMe && <span style={{ color: "var(--color-accent)" }}> ({t("you")})</span>}
        </span>
        {editable ? (
          <div style={{ display: "flex", gap: 4, alignItems: "center", flex: "none" }}>
            <select
              className="input"
              value={member.role}
              disabled={busy}
              onChange={(e) => run(() => changeMemberRole(member.id, e.target.value), t("roleChanged", { name: member.name }))}
              style={{ fontSize: 11, padding: "2px 6px", width: 110 }}
              aria-label={t("roleLabel")}
            >
              {ROLES.filter((r) => isAdmin || r !== "admin").map((r) => (
                <option key={r} value={r}>{t(`role.${r}`)}</option>
              ))}
            </select>
            <button
              className="btn btn-ghost"
              disabled={busy}
              onClick={async () => {
                const ok = await confirm({ title: t("removeTitle", { name: member.name }), body: t("removeConfirm", { name: member.name }), confirmLabel: t("remove"), danger: true });
                if (ok) void run(() => removeMember(member.id), t("removed", { name: member.name }));
              }}
              style={{ fontSize: 11, color: "var(--color-accent-800)" }}
            >
              {t("remove")}
            </button>
          </div>
        ) : (
          <span className="tag tag-outline">{t(`role.${member.role}`)}</span>
        )}
      </div>
    </div>
  );
}

export function TeamClient({
  members,
  pendingInvites,
  canManage,
  isAdmin,
  myUserId,
}: {
  members: Member[];
  pendingInvites: PendingInvite[];
  canManage: boolean;
  isAdmin: boolean;
  myUserId: string;
}) {
  const t = useTranslations("team");
  const [state, formAction, isPending] = useActionState(createInvite, undefined);
  const [inviteRole, setInviteRole] = useState<(typeof ROLES)[number]>("worker");

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
              <select className="input" name="role" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as (typeof ROLES)[number])}>
                {ROLES.filter((r) => isAdmin || r !== "admin").map((r) => (
                  <option key={r} value={r}>{t(`role.${r}`)}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn btn-primary" disabled={isPending}>
              {isPending ? t("inviting") : t("sendInvite")}
            </button>
          </form>
          <p className="text-muted" style={{ fontSize: 12, marginTop: 6 }}>{t(`roleHint.${inviteRole}`)}</p>
          <FormError>{state?.error}</FormError>
        </div>
      )}

      <div>
        <div style={{ fontFamily: "var(--font-heading)", fontSize: 13, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 10 }}>
          {t("members", { n: members.length })}
        </div>
        {members.map((m) => (
          <MemberRow key={m.id} member={m} isMe={m.userId === myUserId} canManage={canManage} isAdmin={isAdmin} />
        ))}
        <div style={{ fontSize: 11, marginTop: 10, color: "color-mix(in srgb,var(--color-text) 55%,transparent)", lineHeight: 1.5 }}>
          {ROLES.map((r) => (
            <div key={r}><strong>{t(`role.${r}`)}</strong> — {t(`roleHint.${r}`)}</div>
          ))}
        </div>
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
