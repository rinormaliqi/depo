import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { AuthShell } from "@/components/auth-shell";
import { hasMembership } from "@/lib/onboarding";
import { NOINDEX } from "@/lib/seo";
import { getValidUserId } from "@/lib/session";
import { CompanyForm } from "./company-form";

export const metadata = NOINDEX;

// Where a Google sign-in lands. Someone who already belongs to an
// organization goes straight to the blueprint; a brand-new user is asked
// the one question the password form asks and Google can't answer.
//
// The membership check needs a *valid* session, not just a present JWT —
// getValidUserId() (not raw auth()) so a force-signed-out or disabled
// user (Epic A2) lands on /login instead of bouncing here and back to
// /start forever, each page reading the same stale cookie differently.
export default async function WelcomePage() {
  const userId = await getValidUserId();
  if (!userId) redirect("/login");
  const session = await auth();
  if (await hasMembership(userId)) redirect("/start");
  const t = await getTranslations("welcome");

  return (
    <AuthShell>
      <div style={{ width: "100%", maxWidth: 360 }}>
        <div style={{ fontFamily: "var(--font-heading)", fontSize: 20, textAlign: "center", marginBottom: 6 }}>{t("title")}</div>
        <p className="text-muted" style={{ fontSize: 13, textAlign: "center", marginTop: 0, marginBottom: 20 }}>
          {t("body", { email: session?.user.email ?? "" })}
        </p>
        <CompanyForm />
      </div>
    </AuthShell>
  );
}
