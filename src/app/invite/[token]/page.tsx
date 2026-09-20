import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth, isGoogleSignInEnabled } from "@/auth";
import { GoogleButton } from "@/components/google-button";
import { db } from "@/db";
import { invites, organizations, users } from "@/db/schema";
import { AuthShell } from "@/components/auth-shell";
import { normalizeEmail } from "@/lib/email-normalize";
import { acceptInviteViaSession } from "@/lib/onboarding";
import { getOrgLockReason } from "@/lib/session";
import { memberships } from "@/db/schema";
import { AcceptInviteForm } from "./accept-invite-form";
import { RequestNewInvite } from "./request-new-invite";
import { PublicLink } from "@/components/public-link";
import { NOINDEX } from "@/lib/seo";


export const metadata = NOINDEX;
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const t = await getTranslations("invite");

  // The row is loaded regardless of state so a dead link can still say
  // which company and who invited, and offer to ask them for a new one.
  const [anyInvite] = await db.select().from(invites).where(eq(invites.token, token));
  const dead = !anyInvite ? "unknown" : anyInvite.acceptedAt ? "used" : anyInvite.expiresAt.getTime() < Date.now() ? "expired" : null;
  const invite = dead ? null : anyInvite;
  const deadOrg = dead && anyInvite ? (await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, anyInvite.organizationId)))[0] : null;
  const deadInviter = dead && anyInvite ? (await db.select({ name: users.name }).from(users).where(eq(users.id, anyInvite.invitedBy)))[0] : null;

  const organization = invite ? (await db.select().from(organizations).where(eq(organizations.id, invite.organizationId)))[0] : null;
  const existingUser = invite ? (await db.select().from(users).where(eq(users.normalizedEmail, normalizeEmail(invite.email))))[0] : null;
  // An existing user who already belongs elsewhere keeps those
  // memberships; say so, so "joining" isn't read as "moving".
  const otherOrgs = existingUser && invite
    ? (await db
        .select({ name: organizations.name })
        .from(memberships)
        .innerJoin(organizations, eq(memberships.organizationId, organizations.id))
        .where(eq(memberships.userId, existingUser.id))).map((o) => o.name).filter((n) => n !== organization?.name)
    : [];
  // A locked company can't take new members (acceptance is refused with
  // the reason) — say so up front, and name who can fix it.
  const lockReason = invite ? await getOrgLockReason(invite.organizationId) : null;
  const lockAdmins = lockReason && invite
    ? await db
        .select({ name: users.name, email: users.email })
        .from(memberships)
        .innerJoin(users, eq(memberships.userId, users.id))
        .where(and(eq(memberships.organizationId, invite.organizationId), eq(memberships.role, "admin")))
    : [];

  // Already signed in — straight after "Continue with Google" from this
  // page, or an existing user who was logged in when they opened the
  // link. If it's the invited inbox, the join happens right here.
  const session = await auth();
  let mismatchEmail: string | null = null;
  if (session?.user?.id && invite) {
    const result = await acceptInviteViaSession(token, session.user.id);
    if (result === "joined" || result === "already-member") redirect("/start");
    if (result === "mismatch") mismatchEmail = session.user.email ?? "";
  }

  return (
    <AuthShell>
      <div style={{ width: "100%", maxWidth: 360 }}>
        {!invite || !organization ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 20, marginBottom: 8 }}>{t(`dead.${dead ?? "unknown"}.title`)}</div>
            <p className="text-muted" style={{ fontSize: 13, lineHeight: 1.55 }}>
              {t(`dead.${dead ?? "unknown"}.body`, { org: deadOrg?.name ?? "", inviter: deadInviter?.name ?? "" })}
            </p>
            {dead === "used" && (
              <PublicLink href="/login" className="btn btn-primary btn-block" style={{ marginTop: 12 }}>{t("goToLogin")}</PublicLink>
            )}
            {dead === "expired" && <RequestNewInvite token={token} inviter={deadInviter?.name ?? ""} />}
          </div>
        ) : (
          <>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ fontFamily: "var(--font-heading)", fontSize: 20 }}>
                {t("title", { org: organization.name })}
              </div>
              <p className="text-muted" style={{ fontSize: 13, marginTop: 4 }}>
                {t("joinAs", { role: t(`role.${invite.role}`), email: invite.email })}
              </p>
            </div>
            {lockReason && (
              <p style={{ fontSize: 13, lineHeight: 1.5, padding: "8px 10px", marginBottom: 14, background: "var(--color-warning-100)", border: "1px solid color-mix(in srgb, var(--color-warning-500) 40%, transparent)" }}>
                {t("lockedBody", { org: organization.name })}{" "}
                {lockAdmins.map((a, i) => (
                  <span key={a.email}>{i > 0 && ", "}<a href={`mailto:${a.email}`} style={{ color: "inherit", textDecoration: "underline" }}>{a.name}</a></span>
                ))}
              </p>
            )}
            {otherOrgs.length > 0 && mismatchEmail === null && (
              <p className="text-muted" style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 14 }}>
                {t("alsoMemberOf", { orgs: otherOrgs.join(", "), org: organization.name })}
              </p>
            )}
            {mismatchEmail !== null ? (
              <p style={{ fontSize: 13, textAlign: "center", color: "var(--color-accent-800)" }}>
                {t("signedInAsOther", { current: mismatchEmail, invited: invite.email })}
              </p>
            ) : (
              <>
                {isGoogleSignInEnabled() && <GoogleButton redirectTo={`/invite/${token}`} label={t("acceptWithGoogle")} />}
                <AcceptInviteForm token={token} isExistingUser={!!existingUser} />
              </>
            )}
          </>
        )}
      </div>
    </AuthShell>
  );
}
