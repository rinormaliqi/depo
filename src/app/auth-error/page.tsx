import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/auth-shell";
import { PublicLink } from "@/components/public-link";
import { NOINDEX } from "@/lib/seo";

export const metadata = NOINDEX;

// Auth.js sends every failure here (auth.config.ts `pages.error`) with
// `?error=<code>`; our own signIn callback adds GoogleUnverified and
// GoogleNoEmail. Each code gets a plain sentence and a way forward instead
// of the library's default screen.
const KNOWN = ["GoogleUnverified", "GoogleNoEmail", "AccessDenied", "OAuthCallbackError", "OAuthAccountNotLinked", "Configuration", "Verification", "CredentialsSignin"] as const;
type Known = (typeof KNOWN)[number];

export default async function AuthErrorPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const t = await getTranslations("authError");
  const code: Known | "Default" = (KNOWN as readonly string[]).includes(error ?? "") ? (error as Known) : "Default";

  return (
    <AuthShell>
      <div style={{ width: "100%", maxWidth: 400, textAlign: "center" }}>
        <div className="lp-kicker" style={{ marginBottom: 6 }}>{t("kicker")}</div>
        <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 22, margin: "0 0 8px" }}>{t(`${code}.title`)}</h1>
        <p className="text-muted" style={{ fontSize: 14, lineHeight: 1.6, margin: "0 0 18px" }}>{t(`${code}.body`)}</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          <PublicLink href="/login" className="btn btn-primary">{t("backToLogin")}</PublicLink>
          <PublicLink href="/contact" className="btn btn-secondary">{t("contact")}</PublicLink>
        </div>
      </div>
    </AuthShell>
  );
}
