import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/auth-shell";
import { confirmEmailChange } from "@/lib/account";
import { NOINDEX } from "@/lib/seo";

export const metadata = NOINDEX;

// The link mailed to the *new* address. Public: the person may open it
// on a phone that isn't signed in; the token is the proof.
export default async function ConfirmEmailChangePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await getTranslations("account.emailChange");
  const outcome = await confirmEmailChange(token);
  return (
    <AuthShell>
      <div style={{ width: "100%", maxWidth: 380, textAlign: "center" }}>
        <div style={{ fontFamily: "var(--font-heading)", fontSize: 20, marginBottom: 8 }}>
          {outcome.ok ? t("doneTitle") : t(`dead.${outcome.reason}.title`)}
        </div>
        <p className="text-muted" style={{ fontSize: 13, marginBottom: 20 }}>
          {outcome.ok ? t("doneBody", { email: outcome.email }) : t(`dead.${outcome.reason}.body`)}
        </p>
        <Link href={outcome.ok ? "/account" : "/account"} className="btn btn-primary btn-block">{t("back")}</Link>
      </div>
    </AuthShell>
  );
}
