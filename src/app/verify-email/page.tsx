import Link from "next/link";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { AuthShell } from "@/components/auth-shell";
import { PublicLink } from "@/components/public-link";
import { db } from "@/db";
import { users } from "@/db/schema";
import { logout } from "@/lib/actions/auth";
import { companyInfo } from "@/lib/company";
import { ChangeEmailForm } from "./change-email-form";
import { ResendForm } from "./resend-form";

// The "check your inbox" holding page a fresh signup lands on. Signed-in
// only (the middleware already enforces that); an already-verified user
// has nothing to do here and is bounced into the app. Everything that can
// go wrong with the mail has a way out here: resend (with a countdown),
// fix a mistyped address, a spam-folder hint naming the sender, contact.
export default async function VerifyEmailPendingPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [user] = await db.select().from(users).where(eq(users.id, session.user.id));
  if (!user) redirect("/login");
  if (user.emailVerifiedAt) redirect("/start");

  const t = await getTranslations("verifyEmail");
  const sender = companyInfo().supportEmail;

  return (
    <AuthShell>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ fontFamily: "var(--font-heading)", fontSize: 20, textAlign: "center", marginBottom: 8 }}>{t("pendingTitle")}</div>
        <p className="text-muted" style={{ fontSize: 13, textAlign: "center", marginBottom: 6 }}>
          {t("pendingBody", { email: user.email })}
        </p>
        <p className="text-muted" style={{ fontSize: 12, textAlign: "center", marginBottom: 20 }}>
          {t("spamHint", { sender })}
        </p>
        <ResendForm />
        <ChangeEmailForm currentEmail={user.email} />
        <div className="text-muted" style={{ marginTop: 18, textAlign: "center", fontSize: 13 }}>
          <Link href="/builder" style={{ color: "var(--color-accent)" }}>{t("continueReadOnly")}</Link>
          {" · "}
          <PublicLink href="/contact?topic=verification" style={{ color: "var(--color-accent)" }}>{t("contactUs")}</PublicLink>
          {" · "}
          <form action={logout} style={{ display: "inline" }}>
            <button type="submit" className="btn btn-ghost" style={{ padding: 0, fontSize: 13, color: "var(--color-accent)" }}>
              {t("signOut")}
            </button>
          </form>
        </div>
      </div>
    </AuthShell>
  );
}
