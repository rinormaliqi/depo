import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getMyFacility } from "@/app/builder/actions";
import { auth } from "@/auth";
import { AppHeader } from "@/components/app-header";
import { formatDate } from "@/lib/format-date";
import { getMyBilling } from "./actions";
import { PlanPicker } from "./plan-picker";

function UsageRow({ label, used, max }: { label: string; used: number; max: number | null }) {
  const pct = max ? Math.min(100, Math.round((used / max) * 100)) : 0;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
        <span>{label}</span>
        <span style={{ fontVariantNumeric: "tabular-nums", color: "color-mix(in srgb,var(--color-text) 60%,transparent)" }}>
          {used}{max !== null ? ` / ${max}` : ""}
        </span>
      </div>
      {max !== null && (
        <div style={{ height: 6, background: "var(--color-neutral-200)" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: pct >= 100 ? "var(--color-accent-800)" : "var(--color-accent)" }} />
        </div>
      )}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: "var(--font-heading)", fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: "color-mix(in srgb,var(--color-text) 55%,transparent)", marginBottom: 10 }}>
      {children}
    </div>
  );
}

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ canceled?: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [facility, billing, t, { canceled }] = await Promise.all([getMyFacility(), getMyBilling(), getTranslations(), searchParams]);
  const tb = await getTranslations("billing");

  const { org, plan, usage, lockReason, role, options, history, onlinePaymentsEnabled } = billing;
  const now = Date.now();
  const daysUntil = (d: Date | null) => (d ? Math.ceil((new Date(d).getTime() - now) / (1000 * 60 * 60 * 24)) : null);
  const trialDaysLeft = org.subscriptionStatus === "trialing" ? daysUntil(org.trialEndsAt) : null;
  const paidDaysLeft = org.subscriptionStatus === "active" ? daysUntil(org.paidUntil) : null;
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;
  const isAdmin = role === "admin";
  const statusUrgent = lockReason !== null || (trialDaysLeft !== null && trialDaysLeft <= 5) || (paidDaysLeft !== null && paidDaysLeft <= 7);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", minHeight: 0, overflow: "hidden" }}>
      {facility && (
        <AppHeader
          facilityName={facility.name}
          floorText={t("common.floorText", { width: facility.widthM.toFixed(1), height: facility.heightM.toFixed(1) })}
          userEmail={session.user.email ?? ""}
        />
      )}
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 26 }}>
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 20, marginBottom: 4 }}>{tb("title")}</div>
          <p className="text-muted" style={{ fontSize: 13, marginBottom: 20 }}>{tb("subtitle")}</p>

          {canceled && (
            <div style={{ border: "1px solid var(--color-divider)", padding: 12, marginBottom: 16, fontSize: 13 }}>{tb("checkoutCanceled")}</div>
          )}

          <div style={{ border: "1px solid var(--color-divider)", padding: 16, marginBottom: 24, background: "#fff" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
              <span style={{ fontFamily: "var(--font-heading)", fontSize: 18 }}>{plan?.name ?? "—"}</span>
              <span className={statusUrgent ? "tag tag-outline" : "tag tag-accent"}>
                {lockReason === "expired" ? tb("status.expired") : tb(`status.${org.subscriptionStatus}`)}
              </span>
            </div>
            {plan && (
              <div style={{ fontSize: 13, color: "color-mix(in srgb,var(--color-text) 55%,transparent)", marginTop: 4 }}>
                {tb("priceLine", { price: (plan.priceCents / 100).toFixed(0) })}
              </div>
            )}
            <div style={{ fontSize: 13, marginTop: 10, color: statusUrgent ? "var(--color-accent-800)" : "var(--color-text)" }}>
              {org.subscriptionStatus === "trialing" && trialDaysLeft === null && (
                <>
                  {tb("trialNotStarted")}{" "}
                  <Link href="/verify-email" style={{ color: "var(--color-accent)" }}>{tb("verifyNow")}</Link>
                </>
              )}
              {org.subscriptionStatus === "trialing" && trialDaysLeft !== null && (trialDaysLeft > 0 ? tb("trialDaysLeft", { n: trialDaysLeft }) : tb("trialEnded"))}
              {org.subscriptionStatus === "active" && org.paidUntil && (
                paidDaysLeft !== null && paidDaysLeft > 0
                  ? tb("paidUntil", { date: formatDate(org.paidUntil), n: paidDaysLeft })
                  : tb("paidExpired", { date: formatDate(org.paidUntil) })
              )}
              {org.subscriptionStatus === "active" && !org.paidUntil && tb("paidIndefinitely")}
              {org.subscriptionStatus === "past_due" && tb("pastDueBody")}
              {org.subscriptionStatus === "canceled" && tb("canceledBody")}
            </div>
          </div>

          <SectionTitle>{tb("choosePlan")}</SectionTitle>
          {isAdmin ? (
            <div style={{ marginBottom: 28 }}>
              <PlanPicker options={options} currentPlanKey={plan?.key ?? ""} onlinePaymentsEnabled={onlinePaymentsEnabled} supportEmail={supportEmail} />
            </div>
          ) : (
            <p className="text-muted" style={{ fontSize: 13, marginBottom: 28 }}>{tb("adminOnlyBody")}</p>
          )}

          <SectionTitle>{tb("usage")}</SectionTitle>
          <UsageRow label={tb("usageUsers")} used={usage.users} max={plan?.maxUsers ?? null} />
          <UsageRow label={tb("usageFacilities")} used={usage.facilities} max={plan?.maxFacilities ?? null} />
          <UsageRow label={tb("usageBins")} used={usage.bins} max={plan?.maxBins ?? null} />

          {history.length > 0 && (
            <div style={{ marginTop: 28 }}>
              <SectionTitle>{tb("history")}</SectionTitle>
              {history.map((p) => (
                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--color-divider)", fontSize: 13 }}>
                  <span>
                    {p.paidAt ? formatDate(p.paidAt) : "—"}
                    <span style={{ color: "color-mix(in srgb,var(--color-text) 55%,transparent)" }}>
                      {" · "}{tb("historyLine", { months: p.months, provider: tb(`provider.${p.provider}`) })}
                      {p.periodEnd && <>{" · "}{tb("historyUntil", { date: formatDate(p.periodEnd) })}</>}
                    </span>
                  </span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>{(p.amountCents / 100).toFixed(0)} {p.currency}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
