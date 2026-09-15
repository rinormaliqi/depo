import { getTranslations } from "next-intl/server";
import { PublicPage } from "@/components/public-page";
import { companyInfo } from "@/lib/company";

export default async function ContactPage() {
  const t = await getTranslations("public.contact");
  const company = companyInfo();
  const rows: [string, React.ReactNode][] = [
    [t("company"), company.legalName],
    ...(company.registrationNumber ? ([[t("regNo"), company.registrationNumber]] as [string, React.ReactNode][]) : []),
    [t("address"), company.address],
    [t("email"), company.supportEmail ? <a href={`mailto:${company.supportEmail}`} style={{ color: "var(--color-accent)" }}>{company.supportEmail}</a> : "—"],
  ];
  return (
    <PublicPage title={t("title")}>
      <p style={{ fontSize: 14, lineHeight: 1.65, marginTop: 0 }}>{t("intro")}</p>
      <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "8px 18px", fontSize: 14, margin: "20px 0" }}>
        {rows.map(([k, v]) => (
          <div key={k} style={{ display: "contents" }}>
            <dt className="text-muted">{k}</dt>
            <dd style={{ margin: 0 }}>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-muted" style={{ fontSize: 13 }}>{t("hours")}</p>
    </PublicPage>
  );
}
