import { getLocale, getTranslations } from "next-intl/server";
import { LegalSections, PublicPage } from "@/components/public-page";
import { LEGAL_UPDATED, privacy } from "@/content/legal";
import { isLocale } from "@/i18n/locales";
import { companyInfo } from "@/lib/company";
import { fillCompany } from "@/lib/legal-text";

export default async function PrivacyPage() {
  const locale = await getLocale();
  const t = await getTranslations("public");
  const sections = fillCompany(privacy[isLocale(locale) ? locale : "sq"], companyInfo());
  return (
    <PublicPage title={t("privacy.title")}>
      <p style={{ fontSize: 14, lineHeight: 1.65, marginTop: 0 }}>{t("privacy.intro")}</p>
      <LegalSections sections={sections} updated={t("updated", { date: LEGAL_UPDATED })} />
    </PublicPage>
  );
}
