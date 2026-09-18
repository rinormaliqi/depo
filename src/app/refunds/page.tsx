import { getLocale, getTranslations } from "next-intl/server";
import { LegalSections, PublicPage } from "@/components/public-page";
import { LEGAL_UPDATED, refunds } from "@/content/legal";
import { isLocale } from "@/i18n/locales";
import { companyInfo } from "@/lib/company";
import { fillCompany } from "@/lib/legal-text";
import { pageMetadata } from "@/lib/seo";


export const generateMetadata = () => pageMetadata("refunds", "/refunds");
export default async function RefundsPage() {
  const locale = await getLocale();
  const t = await getTranslations("public");
  const sections = fillCompany(refunds[isLocale(locale) ? locale : "sq"], companyInfo());
  return (
    <PublicPage title={t("refunds.title")}>
      <p style={{ fontSize: 14, lineHeight: 1.65, marginTop: 0 }}>{t("refunds.intro")}</p>
      <LegalSections sections={sections} updated={t("updated", { date: LEGAL_UPDATED })} />
    </PublicPage>
  );
}
