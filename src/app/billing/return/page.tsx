import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { formatDate } from "@/lib/format-date";
import { getPaymentStatus } from "../actions";

// Where Paysera sends the customer back after paying. Deliberately shows
// whatever the *callback* has recorded rather than trusting the redirect:
// usually the callback has already landed by the time the browser gets
// here, and if it hasn't the page says so and offers a refresh.
export default async function BillingReturnPage({ searchParams }: { searchParams: Promise<{ payment?: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { payment: paymentId } = await searchParams;
  if (!paymentId) redirect("/billing");

  const t = await getTranslations("billing.return");
  const payment = await getPaymentStatus(paymentId);
  if (!payment) redirect("/billing");

  return (
    <main style={{ display: "flex", minHeight: "100vh", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24, padding: "0 24px" }}>
      <div style={{ width: "100%", maxWidth: 400, textAlign: "center" }}>
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: 19, letterSpacing: ".06em", marginBottom: 8 }}>
          SMART<span style={{ color: "var(--color-accent)" }}>/</span>DEPO
        </div>
        {payment.status === "paid" ? (
          <>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 20, marginBottom: 8 }}>{t("paidTitle")}</div>
            <p className="text-muted" style={{ fontSize: 13, marginBottom: 20 }}>
              {t("paidBody", { until: payment.periodEnd ? formatDate(payment.periodEnd) : "—" })}
            </p>
            <Link href="/builder" className="btn btn-primary btn-block">{t("openApp")}</Link>
          </>
        ) : payment.status === "failed" ? (
          <>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 20, marginBottom: 8 }}>{t("failedTitle")}</div>
            <p className="text-muted" style={{ fontSize: 13, marginBottom: 20 }}>{t("failedBody")}</p>
            <Link href="/billing" className="btn btn-secondary btn-block">{t("backToBilling")}</Link>
          </>
        ) : (
          <>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 20, marginBottom: 8 }}>{t("pendingTitle")}</div>
            <p className="text-muted" style={{ fontSize: 13, marginBottom: 20 }}>{t("pendingBody")}</p>
            <Link href={`/billing/return?payment=${payment.id}`} className="btn btn-primary btn-block">{t("refresh")}</Link>
            <p style={{ marginTop: 12, fontSize: 13 }}>
              <Link href="/billing" style={{ color: "var(--color-accent)" }}>{t("backToBilling")}</Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
