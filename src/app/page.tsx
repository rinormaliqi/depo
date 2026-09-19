import Link from "next/link";
import { PublicLink } from "@/components/public-link";
import { getTranslations } from "next-intl/server";
import QRCode from "qrcode";
import { auth } from "@/auth";
import { PlanCards } from "@/components/plan-cards";
import { PublicFooter, PublicHeader } from "@/components/public-page";
import { appBaseUrl } from "@/lib/app-url";
import { logout } from "@/lib/actions/auth";
import { DemoBlueprint } from "./landing/demo-blueprint";
import { pageMetadata } from "@/lib/seo";
import { companyInfo } from "@/lib/company";
import { db } from "@/db";
import { plans } from "@/db/schema";
import { eq } from "drizzle-orm";

// The landing page shows the product rather than describing it: the hero
// is the search-to-highlight loop running live (DemoBlueprint), the
// "how it works" strip is built from the real UI — a label exactly as
// /labels prints it, the scanner form's shape — and the plan grid is the
// same component /pricing renders from the plans table. Copy is specific
// on purpose: a depot in Kosovo, the worker's phone, no hardware.

export const generateMetadata = () => pageMetadata("home", "/");
export default async function Home() {
  const [session, t, tm, base, planRows] = await Promise.all([
    auth(),
    getTranslations("home"),
    getTranslations("meta"),
    appBaseUrl(),
    db.select().from(plans).where(eq(plans.isActive, true)).orderBy(plans.priceCents),
  ]);
  const company = companyInfo();
  // Structured data for search: what the product is, what it costs, who
  // runs it. Prices come from the same `plans` rows the page shows.
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: company.legalName,
        url: base,
        email: company.supportEmail || undefined,
        address: { "@type": "PostalAddress", addressLocality: company.address, addressCountry: "XK" },
      },
      {
        "@type": "SoftwareApplication",
        name: tm("siteName"),
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        description: tm("pages.home.description"),
        url: base,
        offers: planRows.map((p) => ({
          "@type": "Offer",
          name: p.name,
          price: (p.priceCents / 100).toFixed(0),
          priceCurrency: "EUR",
          category: "subscription",
        })),
      },
    ],
  };
  const labelQr = await QRCode.toString(`${base}/builder/bin/demo`, { type: "svg", margin: 0, errorCorrectionLevel: "M" });

  const steps = ["draw", "label", "scan"] as const;

  return (
    <main className="lp">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <PublicHeader />

      <section className="lp-hero-band">
      <div className="lp-hero">
        <div className="lp-hero-copy">
          <div className="lp-kicker">{t("kicker")}</div>
          <h1 className="lp-h1">
            {t("h1a")}<br />
            <span className="lp-h1-accent">{t("h1b")}</span>
          </h1>
          <p className="lp-lead">{t("lead")}</p>
          {session?.user ? (
            <div className="lp-cta">
              <Link href="/builder" className="btn btn-light">{t("openBlueprint")}</Link>
              <form action={async () => { "use server"; await logout(); }}>
                <button type="submit" className="btn btn-outline-light" style={{ fontSize: 12 }}>
                  {t("signOutWithEmail", { email: session.user.email ?? "" })}
                </button>
              </form>
            </div>
          ) : (
            <div className="lp-cta">
              <PublicLink href="/signup" className="btn btn-light">{t("ctaTrial")}</PublicLink>
              <PublicLink href="/login" className="btn btn-outline-light">{t("logIn")}</PublicLink>
              <span className="lp-cta-note">{t("ctaNote")}</span>
            </div>
          )}
          <dl className="lp-numbers">
            {(["lookup", "hardware", "label", "trial"] as const).map((k) => (
              <div key={k}>
                <dt>{t(`numbers.${k}.value`)}</dt>
                <dd>{t(`numbers.${k}.label`)}</dd>
              </div>
            ))}
          </dl>
        </div>
        <DemoBlueprint />
      </div>
      </section>

      <section className="lp-section">
        <div className="lp-section-head">
          <div className="lp-kicker">{t("howKicker")}</div>
          <h2 className="lp-h2">{t("howTitle")}</h2>
        </div>
        <div className="lp-steps">
          {steps.map((step, i) => (
            <div key={step} className="lp-step">
              <div className="lp-step-n">0{i + 1}</div>
              <h3 className="lp-step-title">{t(`steps.${step}.title`)}</h3>
              <p className="lp-step-body">{t(`steps.${step}.body`)}</p>
              <div className="lp-step-figure">
                {step === "draw" && <DrawFigure />}
                {step === "label" && (
                  <div className="label lp-label">
                    <div className="label-text">
                      <div className="label-facility">{t("demo.facility")}</div>
                      <div className="label-code">A-01-3</div>
                      <div className="label-path">A · A-01</div>
                    </div>
                    <div className="label-qr" dangerouslySetInnerHTML={{ __html: labelQr }} />
                  </div>
                )}
                {step === "scan" && <ScanFigure t={t} />}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-section lp-for-section">
        <div className="lp-section-head">
          <div className="lp-kicker">{t("forKicker")}</div>
          <h2 className="lp-h2">{t("forTitle")}</h2>
        </div>
        <ul className="lp-for">
          {(["construction", "parts", "metal", "electrical", "retail", "workshop"] as const).map((k) => (
            <li key={k}>
              <span className="lp-for-name">{t(`for.${k}.name`)}</span>
              <span className="lp-for-what">{t(`for.${k}.what`)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="lp-section lp-facts-section">
        <div className="lp-section-head">
          <div className="lp-kicker">{t("factsKicker")}</div>
          <h2 className="lp-h2">{t("factsTitle")}</h2>
        </div>
        <dl className="lp-facts">
          {(["phone", "hardware", "lang", "prepaid", "roles", "setup"] as const).map((k) => (
            <div key={k} className="lp-fact">
              <dt>{t(`facts.${k}.title`)}</dt>
              <dd>{t(`facts.${k}.body`)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="lp-section" id="pricing">
        <div className="lp-section-head">
          <div className="lp-kicker">{t("pricingKicker")}</div>
          <h2 className="lp-h2">{t("pricingTitle")}</h2>
          <p className="lp-section-lead">{t("pricingLead")}</p>
        </div>
        <PlanCards />
        <p className="text-muted" style={{ fontSize: 13, marginTop: 4 }}>
          {t("pricingNote")}{" "}
          <PublicLink href="/pricing" style={{ color: "var(--color-accent)" }}>{t("pricingLink")}</PublicLink>
        </p>
      </section>

      <section className="lp-final-band">
        <div className="lp-section lp-final">
          <div className="lp-kicker lp-kicker-light">{t("finalKicker")}</div>
          <h2 className="lp-h2">{t("finalTitle")}</h2>
          <p className="lp-section-lead">{t("finalBody")}</p>
          <div className="lp-cta" style={{ justifyContent: "center" }}>
            <PublicLink href="/signup" className="btn btn-light">{t("ctaTrial")}</PublicLink>
            <PublicLink href="/contact" className="btn btn-outline-light">{t("ctaContact")}</PublicLink>
          </div>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}

// A rack with six bays, drawn with the builder's own kind style — the
// thing step one says you draw.
function DrawFigure() {
  return (
    <div className="lp-draw">
      <div className="lp-draw-rack">
        <span className="lp-draw-code">A-01</span>
        <div className="lp-draw-bays">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div key={n} className={n === 1 || n === 3 ? "lp-demo-bay is-stocked" : "lp-demo-bay"}>{n}</div>
          ))}
        </div>
      </div>
      <div className="lp-draw-handle" />
    </div>
  );
}

// The Scanner form's silhouette on a phone: item, quantity, location — the
// three fields a worker fills, with the location coming off the label.
function ScanFigure({ t }: { t: Awaited<ReturnType<typeof getTranslations<"home">>> }) {
  return (
    <div className="lp-phone">
      <div className="lp-phone-row lp-phone-item">
        <span className="lp-phone-kicker">{t("scanFigure.item")}</span>
        <span>{t("demo.exampleItem")}</span>
      </div>
      <div className="lp-phone-grid">
        <div className="lp-phone-field"><label>{t("scanFigure.qty")}</label><div className="lp-phone-input">24</div></div>
        <div className="lp-phone-field"><label>{t("scanFigure.location")}</label><div className="lp-phone-input is-filled">A-01-3</div></div>
      </div>
      <div className="lp-phone-btn">{t("scanFigure.commit")}</div>
    </div>
  );
}
