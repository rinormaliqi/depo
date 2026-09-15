import Link from "next/link";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { db } from "@/db";
import { users } from "@/db/schema";
import { logout } from "@/lib/actions/auth";
import { ResendForm } from "./resend-form";

// The "check your inbox" holding page a fresh signup lands on. Signed-in
// only (the middleware already enforces that); an already-verified user
// has nothing to do here and is bounced into the app.
export default async function VerifyEmailPendingPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [user] = await db.select().from(users).where(eq(users.id, session.user.id));
  if (!user) redirect("/login");
  if (user.emailVerifiedAt) redirect("/builder");

  const t = await getTranslations("verifyEmail");

  return (
    <main style={{ display: "flex", minHeight: "100vh", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24, padding: "0 24px" }}>
      <div style={{ position: "fixed", top: 14, right: 14 }}>
        <LocaleSwitcher />
      </div>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: 19, letterSpacing: ".06em", textAlign: "center", marginBottom: 8 }}>
          SMART<span style={{ color: "var(--color-accent)" }}>/</span>DEPO
        </div>
        <div style={{ fontFamily: "var(--font-heading)", fontSize: 20, textAlign: "center", marginBottom: 8 }}>{t("pendingTitle")}</div>
        <p className="text-muted" style={{ fontSize: 13, textAlign: "center", marginBottom: 20 }}>
          {t("pendingBody", { email: user.email })}
        </p>
        <ResendForm />
        <p className="text-muted" style={{ marginTop: 16, textAlign: "center", fontSize: 13 }}>
          <Link href="/builder" style={{ color: "var(--color-accent)" }}>
            {t("continueReadOnly")}
          </Link>
          {" · "}
          <form action={logout} style={{ display: "inline" }}>
            <button type="submit" className="btn btn-ghost" style={{ padding: 0, fontSize: 13, color: "var(--color-accent)" }}>
              {t("signOut")}
            </button>
          </form>
        </p>
      </div>
    </main>
  );
}
