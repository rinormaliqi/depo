import { PublicLink } from "@/components/public-link";
import { getTranslations } from "next-intl/server";
import { PublicFooter, PublicHeader } from "@/components/public-page";

export default async function NotFound() {
  const t = await getTranslations("meta.notFound");
  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <PublicHeader />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 24px", textAlign: "center", gap: 10 }}>
        <div className="lp-kicker">404</div>
        <h1 className="lp-h2" style={{ margin: 0 }}>{t("title")}</h1>
        <p className="text-muted" style={{ maxWidth: 420, fontSize: 14, lineHeight: 1.6, margin: "4px 0 14px" }}>{t("body")}</p>
        <PublicLink href="/" className="btn btn-primary">{t("home")}</PublicLink>
      </div>
      <PublicFooter />
    </main>
  );
}
