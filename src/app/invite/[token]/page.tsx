import { and, eq, gt, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth, isGoogleSignInEnabled } from "@/auth";
import { GoogleButton } from "@/components/google-button";
import { db } from "@/db";
import { invites, organizations, users } from "@/db/schema";
import { AuthShell } from "@/components/auth-shell";
import { normalizeEmail } from "@/lib/email-normalize";
import { acceptInviteViaSession } from "@/lib/onboarding";
import { AcceptInviteForm } from "./accept-invite-form";
import { NOINDEX } from "@/lib/seo";


export const metadata = NOINDEX;
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const t = await getTranslations("invite");

  const [invite] = await db
    .select()
    .from(invites)
    .where(and(eq(invites.token, token), isNull(invites.acceptedAt), gt(invites.expiresAt, new Date())));

  const organization = invite ? (await db.select().from(organizations).where(eq(organizations.id, invite.organizationId)))[0] : null;
  const existingUser = invite ? (await db.select().from(users).where(eq(users.normalizedEmail, normalizeEmail(invite.email))))[0] : null;

  // Already signed in — straight after "Continue with Google" from this
  // page, or an existing user who was logged in when they opened the
  // link. If it's the invited inbox, the join happens right here.
  const session = await auth();
  let mismatchEmail: string | null = null;
  if (session?.user?.id && invite) {
    const result = await acceptInviteViaSession(token, session.user.id);
    if (result === "joined" || result === "already-member") redirect("/builder");
    if (result === "mismatch") mismatchEmail = session.user.email ?? "";
  }

  return (
    <AuthShell>
      <div style={{ width: "100%", maxWidth: 360 }}>
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: 19, letterSpacing: ".06em", textAlign: "center", marginBottom: 8 }}>
          SMART<span style={{ color: "var(--color-accent)" }}>/</span>DEPO
        </div>

        {!invite || !organization ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 20, marginBottom: 8 }}>{t("invalidTitle")}</div>
            <p className="text-muted" style={{ fontSize: 13 }}>{t("invalidBody")}</p>
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
