import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { LoginForm } from "./login-form";
import { pageMetadata } from "@/lib/seo";


export const generateMetadata = () => pageMetadata("login", "/login");
export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/builder");
  const t = await getTranslations("auth");

  return (
    <main style={{ display: "flex", minHeight: "100vh", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24, padding: "0 24px" }}>
      <div style={{ position: "fixed", top: 14, right: 14 }}>
        <LocaleSwitcher />
      </div>
      <div style={{ width: "100%", maxWidth: 360 }}>
        <div style={{ fontFamily: "var(--font-heading)", fontSize: 20, textAlign: "center", marginBottom: 24 }}>
          {t("login.title")}
        </div>
        <LoginForm />
        <p className="text-muted" style={{ marginTop: 16, textAlign: "center", fontSize: 13 }}>
          {t("login.noAccount")}{" "}
          <Link href="/signup" style={{ color: "var(--color-accent)" }}>
            {t("login.signUpLink")}
          </Link>
        </p>
      </div>
    </main>
  );
}
