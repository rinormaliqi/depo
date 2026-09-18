import { PublicLink } from "@/components/public-link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth, isGoogleSignInEnabled } from "@/auth";
import { GoogleButton } from "@/components/google-button";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "./login-form";
import { pageMetadata } from "@/lib/seo";


export const generateMetadata = () => pageMetadata("login", "/login");
export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/builder");
  const t = await getTranslations("auth");

  return (
    <AuthShell>
      <div style={{ width: "100%", maxWidth: 360 }}>
        <div style={{ fontFamily: "var(--font-heading)", fontSize: 20, textAlign: "center", marginBottom: 24 }}>
          {t("login.title")}
        </div>
        {isGoogleSignInEnabled() && <GoogleButton redirectTo="/welcome" />}
        <LoginForm />
        <p className="text-muted" style={{ marginTop: 16, textAlign: "center", fontSize: 13 }}>
          {t("login.noAccount")}{" "}
          <PublicLink href="/signup" style={{ color: "var(--color-accent)" }}>
            {t("login.signUpLink")}
          </PublicLink>
        </p>
      </div>
    </AuthShell>
  );
}
