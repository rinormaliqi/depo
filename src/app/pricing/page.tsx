import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PlanCards } from "@/components/plan-cards";
import { PublicPage } from "@/components/public-page";
import { pageMetadata } from "@/lib/seo";

// The public price list. Reads the same `plans` rows /billing charges
// from, so the number a prospect sees here is the number they pay — and
// what Paysera's reviewers compare against the project application.

export const generateMetadata = () => pageMetadata("pricing", "/pricing");
export default async function PricingPage() {
  const t = await getTranslations("public.pricing");

  return (
    <PublicPage title={t("title")} wide>
      <p style={{ fontSize: 15, lineHeight: 1.6, marginTop: 0, maxWidth: 640 }}>{t("intro")}</p>

      <PlanCards />

      <div style={{ fontSize: 13, lineHeight: 1.7, maxWidth: 720, color: "color-mix(in srgb,var(--color-text) 75%,transparent)" }}>
        <p style={{ margin: "0 0 6px" }}>{t("noteTrial")}</p>
        <p style={{ margin: "0 0 6px" }}>{t("notePrepaid")}</p>
        <p style={{ margin: "0 0 6px" }}>{t("noteVat")}</p>
        <p style={{ margin: 0 }}>
          {t("noteRefund")}{" "}
          <Link href="/refunds" style={{ color: "var(--color-accent)" }}>{t("refundLink")}</Link>
        </p>
      </div>
    </PublicPage>
  );
}
