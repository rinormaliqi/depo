import { and, eq, gt, isNull } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import { invites, organizations, users } from "@/db/schema";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { AcceptInviteForm } from "./accept-invite-form";

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
  const existingUser = invite ? (await db.select().from(users).where(eq(users.email, invite.email)))[0] : null;

  return (
    <main style={{ display: "flex", minHeight: "100vh", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24, padding: "0 24px" }}>
      <div style={{ position: "fixed", top: 14, right: 14 }}>
        <LocaleSwitcher />
      </div>
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
            <AcceptInviteForm token={token} isExistingUser={!!existingUser} />
          </>
        )}
      </div>
    </main>
  );
}
