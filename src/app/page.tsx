import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { PublicFooter } from "@/components/public-page";
import { logout } from "@/lib/actions/auth";

export default async function Home() {
  const session = await auth();
  const t = await getTranslations();

  return (
    <main style={{ display: "flex", minHeight: "100vh", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: "0 24px", textAlign: "center" }}>
      <div style={{ position: "fixed", top: 14, right: 14 }}>
        <LocaleSwitcher />
      </div>
      <div style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: 26, letterSpacing: ".06em" }}>
        SMART<span style={{ color: "var(--color-accent)" }}>/</span>DEPO
      </div>
      <p className="text-muted">{t("home.tagline")}</p>

      {session?.user ? (
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <Link href="/builder" className="btn btn-primary">
            {t("home.openBlueprint")}
          </Link>
          <form action={async () => { "use server"; await logout(); }}>
            <button type="submit" className="btn btn-ghost" style={{ fontSize: 12 }}>
              {t("home.signOutWithEmail", { email: session.user.email ?? "" })}
            </button>
          </form>
        </div>
      ) : (
        <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
          <Link href="/pricing" className="btn btn-secondary">
            {t("public.nav.pricing")}
          </Link>
          <Link href="/login" className="btn btn-secondary">
            {t("home.logIn")}
          </Link>
          <Link href="/signup" className="btn btn-primary">
            {t("home.signUp")}
          </Link>
        </div>
      )}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0 }}>
        <PublicFooter />
      </div>
    </main>
  );
}
