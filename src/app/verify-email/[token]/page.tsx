import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { AuthShell } from "@/components/auth-shell";
import { consumeVerificationToken } from "@/lib/email-verification";
import { NOINDEX } from "@/lib/seo";
import { ResendForm } from "../resend-form";

// Public (middleware allowlists /verify-email/<token>) — the click can come
// from a different browser than the one that signed up, e.g. a phone's
// mail app, so a session isn't required. Redeeming is a GET side effect,
// which is fine here: the token is single-use and only ever flips a flag
// the user wants flipped. A dead link says why and offers the next step.

export const metadata = NOINDEX;
export default async function VerifyEmailTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await getTranslations("verifyEmail");
  const outcome = await consumeVerificationToken(token);
  const session = await auth();
  const signedIn = !!session?.user;
  // "Send a new link" only makes sense for the account the link belonged to.
  const canResendHere = signedIn && !outcome.ok && outcome.reason === "expired" && outcome.userId === session?.user?.id;

  return (
    <AuthShell>
      <div style={{ width: "100%", maxWidth: 380, textAlign: "center" }}>
        {outcome.ok ? (
          <>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 20, marginBottom: 8 }}>{t("doneTitle")}</div>
            <p className="text-muted" style={{ fontSize: 13, marginBottom: 20 }}>{t("doneBody")}</p>
            <Link href={signedIn ? "/start" : "/login"} className="btn btn-primary btn-block">
              {signedIn ? t("goToApp") : t("goToLogin")}
            </Link>
          </>
        ) : (
          <>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 20, marginBottom: 8 }}>{t(`dead.${outcome.reason}.title`)}</div>
            <p className="text-muted" style={{ fontSize: 13, marginBottom: 20 }}>{t(`dead.${outcome.reason}.body`)}</p>
            {canResendHere ? (
              <ResendForm />
            ) : (
              <Link href={signedIn ? "/verify-email" : "/login"} className="btn btn-primary btn-block">
                {outcome.reason === "used" ? t("goToLogin") : signedIn ? t("requestNew") : t("loginToResend")}
              </Link>
            )}
          </>
        )}
      </div>
    </AuthShell>
  );
}
