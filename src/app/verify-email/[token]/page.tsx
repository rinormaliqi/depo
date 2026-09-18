import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { consumeVerificationToken } from "@/lib/email-verification";
import { NOINDEX } from "@/lib/seo";

// Public (middleware allowlists /verify-email/<token>) — the click can come
// from a different browser than the one that signed up, e.g. a phone's
// mail app, so a session isn't required. Redeeming is a GET side effect,
// which is fine here: the token is single-use and only ever flips a flag
// the user wants flipped.

export const metadata = NOINDEX;
export default async function VerifyEmailTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await getTranslations("verifyEmail");
  const result = await consumeVerificationToken(token);
  const session = await auth();
  const nextHref = session?.user ? "/builder" : "/login";

  return (
    <main style={{ display: "flex", minHeight: "100vh", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24, padding: "0 24px" }}>
      <div style={{ position: "fixed", top: 14, right: 14 }}>
        <LocaleSwitcher />
      </div>
      <div style={{ width: "100%", maxWidth: 360, textAlign: "center" }}>
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: 19, letterSpacing: ".06em", marginBottom: 8 }}>
          SMART<span style={{ color: "var(--color-accent)" }}>/</span>DEPO
        </div>
        {result ? (
          <>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 20, marginBottom: 8 }}>{t("doneTitle")}</div>
            <p className="text-muted" style={{ fontSize: 13, marginBottom: 20 }}>{t("doneBody")}</p>
            <Link href={nextHref} className="btn btn-primary btn-block">
              {session?.user ? t("goToApp") : t("goToLogin")}
            </Link>
          </>
        ) : (
          <>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 20, marginBottom: 8 }}>{t("invalidTitle")}</div>
            <p className="text-muted" style={{ fontSize: 13, marginBottom: 20 }}>{t("invalidBody")}</p>
            <Link href={session?.user ? "/verify-email" : "/login"} className="btn btn-secondary btn-block">
              {session?.user ? t("requestNew") : t("goToLogin")}
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
