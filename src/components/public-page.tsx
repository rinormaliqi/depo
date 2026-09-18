import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { companyInfo } from "@/lib/company";

// Shell for the logged-out, indexable pages (pricing, terms, refunds,
// contact). Same footer everywhere so the payment provider's reviewers —
// and customers — can reach the legal pages from any of them.
export async function PublicPage({ title, children, wide = false }: { title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <PublicHeader />
      <div style={{ flex: 1, padding: "32px 24px" }}>
        <div style={{ maxWidth: wide ? 960 : 720, margin: "0 auto" }}>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 26, fontWeight: 600, margin: "0 0 20px" }}>{title}</h1>
          {children}
        </div>
      </div>
      <PublicFooter />
    </main>
  );
}

export async function PublicHeader() {
  const t = await getTranslations("public");
  return (
    <header className="public-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 24px", borderBottom: "1px solid var(--color-divider)" }}>
      <Link href="/" style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: 19, letterSpacing: ".06em", color: "var(--color-text)", textDecoration: "none" }}>
        SMART<span style={{ color: "var(--color-accent)" }}>/</span>DEPO
      </Link>
      <nav style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 13 }}>
        <Link href="/pricing" className="public-header-pricing" style={{ color: "var(--color-text)" }}>{t("nav.pricing")}</Link>
        <Link href="/login" style={{ color: "var(--color-text)" }}>{t("nav.login")}</Link>
        <Link href="/signup" className="btn btn-primary" style={{ fontSize: 12 }}>{t("nav.signup")}</Link>
        <LocaleSwitcher />
      </nav>
    </header>
  );
}

export async function PublicFooter() {
  const t = await getTranslations("public");
  const company = companyInfo();
  return (
    <footer style={{ borderTop: "1px solid var(--color-divider)", padding: "18px 24px", fontSize: 12, color: "color-mix(in srgb,var(--color-text) 55%,transparent)" }}>
      <div style={{ maxWidth: 960, margin: "0 auto", display: "flex", flexWrap: "wrap", gap: "8px 18px", justifyContent: "space-between" }}>
        <span>
          © {new Date().getFullYear()} {company.legalName}
          {company.registrationNumber && <> · {t("footer.regNo", { n: company.registrationNumber })}</>}
          {" · "}{company.address}
        </span>
        <span style={{ display: "flex", gap: 14 }}>
          <Link href="/pricing" style={{ color: "inherit" }}>{t("nav.pricing")}</Link>
          <Link href="/terms" style={{ color: "inherit" }}>{t("nav.terms")}</Link>
          <Link href="/refunds" style={{ color: "inherit" }}>{t("nav.refunds")}</Link>
          <Link href="/privacy" style={{ color: "inherit" }}>{t("nav.privacy")}</Link>
          <Link href="/contact" style={{ color: "inherit" }}>{t("nav.contact")}</Link>
        </span>
      </div>
    </footer>
  );
}

// Renders {title, paragraphs[]} sections from src/content/legal.ts.
export function LegalSections({ sections, updated }: { sections: { title: string; paragraphs: string[] }[]; updated: string }) {
  return (
    <div style={{ fontSize: 14, lineHeight: 1.65 }}>
      <p className="text-muted" style={{ fontSize: 12, marginTop: 0 }}>{updated}</p>
      {sections.map((s, i) => (
        <section key={i} style={{ marginTop: 22 }}>
          <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 16, fontWeight: 600, margin: "0 0 8px" }}>{i + 1}. {s.title}</h2>
          {s.paragraphs.map((p, j) => (
            <p key={j} style={{ margin: "0 0 8px" }}>{p}</p>
          ))}
        </section>
      ))}
    </div>
  );
}
