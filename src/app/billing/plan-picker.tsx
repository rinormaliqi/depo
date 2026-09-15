"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { BILLING_PERIODS, type BillingMonths, priceForPeriod } from "@/lib/billing-plans";
import { startCheckout } from "./actions";

type Option = {
  plan: { key: string; name: string; priceCents: number; maxUsers: number | null; maxFacilities: number | null; maxBins: number | null };
  blockedBy: ("users" | "facilities" | "bins")[];
};

export function PlanPicker({ options, currentPlanKey, onlinePaymentsEnabled, supportEmail }: {
  options: Option[];
  currentPlanKey: string;
  onlinePaymentsEnabled: boolean;
  supportEmail?: string;
}) {
  const t = useTranslations("billing");
  const [state, formAction, isPending] = useActionState(startCheckout, undefined);
  const firstAllowed = options.find((o) => o.blockedBy.length === 0)?.plan.key ?? options[0]?.plan.key ?? "";
  const [planKey, setPlanKey] = useState(options.some((o) => o.plan.key === currentPlanKey && o.blockedBy.length === 0) ? currentPlanKey : firstAllowed);
  const [months, setMonths] = useState<BillingMonths>(1);
  const chosen = options.find((o) => o.plan.key === planKey);

  const limit = (n: number | null) => (n === null ? t("unlimited") : String(n));

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
        {options.map(({ plan, blockedBy }) => {
          const active = plan.key === planKey;
          const blocked = blockedBy.length > 0;
          return (
            <button
              key={plan.key}
              type="button"
              disabled={blocked}
              onClick={() => setPlanKey(plan.key)}
              style={{
                textAlign: "left", padding: 14, font: "inherit", cursor: blocked ? "not-allowed" : "pointer",
                border: active ? "2px solid var(--color-accent)" : "1px solid var(--color-divider)",
                background: "#fff", opacity: blocked ? 0.55 : 1,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontFamily: "var(--font-heading)", fontSize: 17 }}>{plan.name}</span>
                {plan.key === currentPlanKey && <span className="tag tag-outline">{t("currentPlan")}</span>}
              </div>
              <div style={{ fontSize: 13, marginTop: 4 }}>{t("priceLine", { price: (plan.priceCents / 100).toFixed(0) })}</div>
              <ul style={{ margin: "10px 0 0", paddingLeft: 16, fontSize: 12, lineHeight: 1.6, color: "color-mix(in srgb,var(--color-text) 70%,transparent)" }}>
                <li>{t("limitUsers", { n: limit(plan.maxUsers) })}</li>
                <li>{t("limitFacilities", { n: limit(plan.maxFacilities) })}</li>
                <li>{t("limitBins", { n: limit(plan.maxBins) })}</li>
              </ul>
              {blocked && (
                <div style={{ fontSize: 11, marginTop: 8, color: "var(--color-accent-800)" }}>
                  {t("blockedBy", { what: blockedBy.map((b) => t(`usage${b[0].toUpperCase()}${b.slice(1)}`).toLowerCase()).join(", ") })}
                </div>
              )}
            </button>
          );
        })}
        <div style={{ padding: 14, border: "1px dashed var(--color-divider)" }}>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 17 }}>Enterprise</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>{t("enterprisePrice")}</div>
          <p style={{ fontSize: 12, marginTop: 10, lineHeight: 1.5, color: "color-mix(in srgb,var(--color-text) 70%,transparent)" }}>{t("enterpriseBody")}</p>
          {supportEmail && (
            <a href={`mailto:${supportEmail}?subject=SmartDepo Enterprise`} className="btn btn-secondary" style={{ marginTop: 10, fontSize: 12 }}>{t("contactUs")}</a>
          )}
        </div>
      </div>

      <input type="hidden" name="plan" value={planKey} />
      <input type="hidden" name="months" value={months} />

      <div>
        <div style={{ fontSize: 12, marginBottom: 6, color: "color-mix(in srgb,var(--color-text) 60%,transparent)" }}>{t("periodLabel")}</div>
        <div className="seg">
          {BILLING_PERIODS.map((m) => (
            <button
              key={m}
              type="button"
              className="seg-opt"
              onClick={() => setMonths(m)}
              style={{ background: months === m ? "var(--color-accent)" : undefined, color: months === m ? "var(--color-bg)" : undefined }}
            >
              {t("months", { n: m })}
            </button>
          ))}
        </div>
      </div>

      {chosen && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: 12, border: "1px solid var(--color-divider)", background: "#fff" }}>
          <div>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 16 }}>
              {t("total", { amount: (priceForPeriod(chosen.plan, months) / 100).toFixed(0) })}
            </div>
            <div style={{ fontSize: 11, color: "color-mix(in srgb,var(--color-text) 55%,transparent)" }}>
              {t("totalHint", { plan: chosen.plan.name, n: months })}
            </div>
          </div>
          {onlinePaymentsEnabled ? (
            <button type="submit" className="btn btn-primary" disabled={isPending || !chosen}>
              {isPending ? t("redirecting") : t("payWithPaysera")}
            </button>
          ) : (
            <span className="text-muted" style={{ fontSize: 12, maxWidth: 220, textAlign: "right" }}>
              {supportEmail ? t("payOfflineWithEmail", { email: supportEmail }) : t("payOffline")}
            </span>
          )}
        </div>
      )}

      {onlinePaymentsEnabled && (
        <p className="text-muted" style={{ fontSize: 11 }}>
          {supportEmail ? t("bankTransferHintWithEmail", { email: supportEmail }) : t("bankTransferHint")}
        </p>
      )}
      {state?.error && <p style={{ fontSize: 13, color: "var(--color-accent-800)" }}>{state.error}</p>}
    </form>
  );
}
