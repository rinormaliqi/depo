import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { AuthShell } from "@/components/auth-shell";
import { SignupForm } from "./signup-form";
import { pageMetadata } from "@/lib/seo";


export const generateMetadata = () => pageMetadata("signup", "/signup");
export default async function SignupPage() {
  const session = await auth();
  if (session?.user) redirect("/builder");
  const t = await getTranslations("auth");

  return (
    <AuthShell>
      <div style={{ width: "100%", maxWidth: 360 }}>
        <div style={{ fontFamily: "var(--font-heading)", fontSize: 20, textAlign: "center", marginBottom: 24 }}>
          {t("signup.title")}
        </div>
        <SignupForm />
        <p className="text-muted" style={{ marginTop: 16, textAlign: "center", fontSize: 13 }}>
          {t("signup.haveAccount")}{" "}
          <Link href="/login" style={{ color: "var(--color-accent)" }}>
            {t("signup.logInLink")}
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
