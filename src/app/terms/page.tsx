import { getLocale, getTranslations } from "next-intl/server";
import { LegalSections, PublicPage } from "@/components/public-page";
import { LEGAL_UPDATED, terms } from "@/content/legal";
import { isLocale } from "@/i18n/locales";
import { companyInfo } from "@/lib/company";
import { fillCompany } from "@/lib/legal-text";
import { pageMetadata } from "@/lib/seo";


export const generateMetadata = () => pageMetadata("terms", "/terms");
export default async function TermsPage() {
  const locale = await getLocale();
  const t = await getTranslations("public");
  const sections = fillCompany(terms[isLocale(locale) ? locale : "sq"], companyInfo());
  return (
    <PublicPage title={t("terms.title")}>
      <LegalSections sections={sections} updated={t("updated", { date: LEGAL_UPDATED })} />
    </PublicPage>
  );
}
