import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ForgotPasswordForm } from "./forgot-password-form";
import { pageMetadata } from "@/lib/seo";


export const generateMetadata = () => pageMetadata("forgotPassword", "/forgot-password");
export default async function ForgotPasswordPage() {
  const session = await auth();
  if (session?.user) redirect("/builder");
  const t = await getTranslations("forgotPassword");

  return (
    <main style={{ display: "flex", minHeight: "100vh", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24, padding: "0 24px" }}>
      <div style={{ position: "fixed", top: 14, right: 14 }}>
        <LocaleSwitcher />
      </div>
      <div style={{ width: "100%", maxWidth: 360 }}>
        <div style={{ fontFamily: "var(--font-heading)", fontSize: 20, marginBottom: 8 }}>{t("title")}</div>
        <p className="text-muted" style={{ fontSize: 13, marginBottom: 24 }}>{t("subtitle")}</p>
        <ForgotPasswordForm />
        <p className="text-muted" style={{ marginTop: 16, textAlign: "center", fontSize: 13 }}>
          <Link href="/login" style={{ color: "var(--color-accent)" }}>
            {t("backToLogin")}
          </Link>
        </p>
      </div>
    </main>
  );
}
