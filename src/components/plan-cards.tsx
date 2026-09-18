import Link from "next/link";
import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import { plans } from "@/db/schema";
import { BILLING_PERIODS, SELF_SERVE_PLAN_KEYS } from "@/lib/billing-plans";
import { companyInfo } from "@/lib/company";

// The plan grid shown on /pricing and on the landing page. Reads the same
// `plans` rows /billing charges from, so the number a prospect sees is
// the number they pay — and what Paysera's reviewers compare against the
// project application.
export async function PlanCards() {
  const t = await getTranslations("public.pricing");
  const tb = await getTranslations("billing");
  const company = companyInfo();
  const rows = await db.select().from(plans).where(eq(plans.isActive, true)).orderBy(plans.priceCents);
  const limit = (n: number | null) => (n === null ? tb("unlimited") : String(n));
  const eur = (cents: number) => `€${(cents / 100).toFixed(0)}`;
  // "1, 3 or 12" — the offered periods, with the localized "or" before the last.
  const periodsText = `${BILLING_PERIODS.slice(0, -1).join(", ")} ${t("or")} ${BILLING_PERIODS[BILLING_PERIODS.length - 1]}`;

  return (
  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14, margin: "24px 0" }}>
      {rows.map((plan) => {
        const selfServe = (SELF_SERVE_PLAN_KEYS as readonly string[]).includes(plan.key);
        const anchor = plan.key === "business";
        return (
          <div key={plan.id} style={{ padding: 18, background: "#fff", border: anchor ? "2px solid var(--color-accent)" : "1px solid var(--color-divider)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={{ fontFamily: "var(--font-heading)", fontSize: 20 }}>{plan.name}</div>
              {anchor && <span className="tag tag-accent">{t("popular")}</span>}
            </div>
            <div style={{ fontSize: 26, fontFamily: "var(--font-heading)", marginTop: 8 }}>
              {selfServe ? eur(plan.priceCents) : t("from", { price: eur(plan.priceCents) })}
              <span className="text-muted" style={{ fontSize: 13, fontFamily: "inherit" }}> {t("perMonth")}</span>
            </div>
            <ul style={{ margin: "14px 0 0", paddingLeft: 18, fontSize: 13, lineHeight: 1.8 }}>
              <li>{tb("limitUsers", { n: limit(plan.maxUsers) })}</li>
              <li>{tb("limitFacilities", { n: limit(plan.maxFacilities) })}</li>
              <li>{tb("limitBins", { n: limit(plan.maxBins) })}</li>
              <li>{plan.movementHistoryMonths === null ? t("historyUnlimited") : t("historyMonths", { n: plan.movementHistoryMonths })}</li>
            </ul>
            {selfServe ? (
              <p style={{ marginTop: 14, fontSize: 12, color: "color-mix(in srgb,var(--color-text) 60%,transparent)" }}>
                {t("periodsNote", { periods: periodsText })}
              </p>
            ) : (
              <p style={{ marginTop: 14, fontSize: 12, color: "color-mix(in srgb,var(--color-text) 60%,transparent)" }}>{t("enterpriseNote")}</p>
            )}
            <div style={{ marginTop: 16 }}>
              {selfServe ? (
                <Link href="/signup" className="btn btn-primary btn-block">{t("startTrial")}</Link>
              ) : company.supportEmail ? (
                <a href={`mailto:${company.supportEmail}?subject=SmartDepo Enterprise`} className="btn btn-secondary btn-block">{tb("contactUs")}</a>
              ) : (
                <Link href="/contact" className="btn btn-secondary btn-block">{tb("contactUs")}</Link>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
