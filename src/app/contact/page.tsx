import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { PublicPage } from "@/components/public-page";
import { companyInfo } from "@/lib/company";
import { pageMetadata } from "@/lib/seo";
import { ContactForm } from "./contact-form";


export const generateMetadata = () => pageMetadata("contact", "/contact");
export default async function ContactPage({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
  const [t, session, { topic }] = await Promise.all([getTranslations("public.contact"), auth(), searchParams]);
  // A link from a stuck flow (e.g. verification) pre-fills what happened.
  const message = topic === "verification" ? t("topics.verification", { email: session?.user?.email ?? "" }) : undefined;
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
      <ContactForm defaults={{ name: session?.user?.name ?? undefined, email: session?.user?.email ?? undefined, message }} />
      <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 16, fontWeight: 600, margin: "32px 0 0" }}>{t("detailsTitle")}</h2>
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
