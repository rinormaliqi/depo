import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { AuthShell } from "@/components/auth-shell";
import { hasMembership } from "@/lib/onboarding";
import { NOINDEX } from "@/lib/seo";
import { CompanyForm } from "./company-form";

export const metadata = NOINDEX;

// Where a Google sign-in lands. Someone who already belongs to an
// organization goes straight to the blueprint; a brand-new user is asked
// the one question the password form asks and Google can't answer.
export default async function WelcomePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (await hasMembership(session.user.id)) redirect("/builder");
  const t = await getTranslations("welcome");

  return (
    <AuthShell>
      <div style={{ width: "100%", maxWidth: 360 }}>
        <div style={{ fontFamily: "var(--font-heading)", fontSize: 20, textAlign: "center", marginBottom: 6 }}>{t("title")}</div>
        <p className="text-muted" style={{ fontSize: 13, textAlign: "center", marginTop: 0, marginBottom: 20 }}>
          {t("body", { email: session.user.email ?? "" })}
        </p>
        <CompanyForm />
      </div>
    </AuthShell>
  );
}
