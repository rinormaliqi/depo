"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useActionState, useState } from "react";
import { BANK_TRANSFER_MONTHS, BILLING_PERIODS, CONTRACT_ELIGIBLE_PLAN_KEYS, PAYSERA_MONTHS, type BillingMonths, priceForPeriod } from "@/lib/billing-plans";
import { requestBankTransfer, startCheckout } from "./actions";
import { FormError } from "@/components/form-error";

type Option = {
  plan: { key: string; name: string; priceCents: number; maxUsers: number | null; maxFacilities: number | null; maxBins: number | null };
  blockedBy: ("users" | "facilities" | "bins")[];
};

type Bank = { bankName: string; iban: string; swift: string };

export function PlanPicker({
  options,
  currentPlanKey,
  enterprisePriceCents,
  onlinePaymentsEnabled,
  supportEmail,
  bank,
  orgName,
}: {
  options: Option[];
  currentPlanKey: string;
  enterprisePriceCents: number | null;
  onlinePaymentsEnabled: boolean;
  supportEmail?: string;
  bank: Bank;
  orgName: string;
}) {
  const t = useTranslations("billing");
  const [payseraState, payseraAction, payseraPending] = useActionState(startCheckout, undefined);
  const [transferState, transferAction, transferPending] = useActionState(requestBankTransfer, undefined);
  const firstAllowed = options.find((o) => o.blockedBy.length === 0)?.plan.key ?? options[0]?.plan.key ?? "";
  const [planKey, setPlanKey] = useState(options.some((o) => o.plan.key === currentPlanKey && o.blockedBy.length === 0) ? currentPlanKey : firstAllowed);
  const [months, setMonths] = useState<BillingMonths>(1);
  const chosen = options.find((o) => o.plan.key === planKey);
  const isBankTransfer = (BANK_TRANSFER_MONTHS as readonly number[]).includes(months);
  const isContract = months === 12;

  const limit = (n: number | null) => (n === null ? t("unlimited") : String(n));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
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
          {enterprisePriceCents !== null && <div style={{ fontSize: 13, marginTop: 4 }}>{t("enterprisePrice", { price: (enterprisePriceCents / 100).toFixed(0) })}</div>}
          <p style={{ fontSize: 12, marginTop: 10, lineHeight: 1.5, color: "color-mix(in srgb,var(--color-text) 70%,transparent)" }}>{t("enterpriseBody")}</p>
          {supportEmail && (
            <a href={`mailto:${supportEmail}?subject=SmartDepo Enterprise`} className="btn btn-secondary" style={{ marginTop: 10, fontSize: 12 }}>{t("contactUs")}</a>
          )}
        </div>
      </div>

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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: 12, border: "1px solid var(--color-divider)", background: "#fff", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 16 }}>
              {t("total", { amount: (priceForPeriod(chosen.plan, months) / 100).toFixed(0) })}
            </div>
            <div style={{ fontSize: 11, color: "color-mix(in srgb,var(--color-text) 55%,transparent)" }}>
              {t("totalHint", { plan: chosen.plan.name, n: months })}
            </div>
          </div>

          {months === PAYSERA_MONTHS &&
            (onlinePaymentsEnabled ? (
              <form action={payseraAction}>
                <input type="hidden" name="plan" value={planKey} />
                <input type="hidden" name="months" value={months} />
                <button type="submit" className="btn btn-primary" disabled={payseraPending || !chosen}>
                  {payseraPending ? t("redirecting") : t("payWithPaysera")}
                </button>
              </form>
            ) : (
              <span className="text-muted" style={{ fontSize: 12, maxWidth: 220, textAlign: "right" }}>
                {supportEmail ? t("payOfflineWithEmail", { email: supportEmail }) : t("payOffline")}
              </span>
            ))}

          {isContract &&
            ((CONTRACT_ELIGIBLE_PLAN_KEYS as readonly string[]).includes(chosen.plan.key) ? (
              <Link href="/billing/contract" className="btn btn-primary">{t("startContractFlow")}</Link>
            ) : supportEmail ? (
              <a href={`mailto:${supportEmail}?subject=SmartDepo ${chosen.plan.name} — 12 months`} className="btn btn-secondary">{t("contactUs")}</a>
            ) : (
              <span className="text-muted" style={{ fontSize: 12, maxWidth: 220, textAlign: "right" }}>{t("contractComingSoon")}</span>
            ))}
        </div>
      )}

      {chosen && isBankTransfer && (
        <div style={{ padding: 12, border: "1px solid var(--color-divider)", background: "#fff", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 14 }}>{t("bankTransferPanelTitle")}</div>
          {bank.iban ? (
            <>
              <p style={{ fontSize: 12, margin: 0, lineHeight: 1.6 }}>
                {t("bankTransferPanelBody", { amount: (priceForPeriod(chosen.plan, months) / 100).toFixed(0), reference: orgName })}
              </p>
              <dl style={{ fontSize: 12, margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "2px 10px" }}>
                {bank.bankName && (<><dt className="text-muted">{t("bankTransferBankName")}</dt><dd style={{ margin: 0 }}>{bank.bankName}</dd></>)}
                <dt className="text-muted">{t("bankTransferIban")}</dt><dd style={{ margin: 0, fontVariantNumeric: "tabular-nums" }}>{bank.iban}</dd>
                {bank.swift && (<><dt className="text-muted">{t("bankTransferSwift")}</dt><dd style={{ margin: 0 }}>{bank.swift}</dd></>)}
              </dl>
              {transferState?.ok ? (
                <p style={{ fontSize: 12, color: "var(--color-accent-800)", margin: 0 }}>{t("bankTransferSent")}</p>
              ) : (
                <form action={transferAction}>
                  <input type="hidden" name="plan" value={planKey} />
                  <input type="hidden" name="months" value={months} />
                  <button type="submit" className="btn btn-secondary" disabled={transferPending}>
                    {transferPending ? t("bankTransferSending") : t("bankTransferButton")}
                  </button>
                  <FormError>{transferState?.error}</FormError>
                </form>
              )}
            </>
          ) : (
            <p style={{ fontSize: 12, margin: 0 }}>
              {supportEmail ? t("payOfflineWithEmail", { email: supportEmail }) : t("payOffline")}
            </p>
          )}
        </div>
      )}

      {onlinePaymentsEnabled && months === PAYSERA_MONTHS && (
        <p className="text-muted" style={{ fontSize: 11 }}>
          {supportEmail ? t("bankTransferHintWithEmail", { email: supportEmail }) : t("bankTransferHint")}
        </p>
      )}
      <FormError>{payseraState?.error}</FormError>
    </div>
  );
}
