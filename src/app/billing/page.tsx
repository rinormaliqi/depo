import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getMyFacility } from "@/app/builder/actions";
import { auth } from "@/auth";
import { AppHeader } from "@/components/app-header";
import { getMyBilling } from "./actions";

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

export default async function BillingPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [facility, billing, t] = await Promise.all([getMyFacility(), getMyBilling(), getTranslations()]);
  const tb = await getTranslations("billing");

  const { org, plan, usage } = billing;
  const now = new Date();
  const trialDaysLeft = org.trialEndsAt
    ? Math.ceil((new Date(org.trialEndsAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;

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
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 20, marginBottom: 4 }}>{tb("title")}</div>
          <p className="text-muted" style={{ fontSize: 13, marginBottom: 20 }}>{tb("subtitle")}</p>

          <div style={{ border: "1px solid var(--color-divider)", padding: 16, marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
              <span style={{ fontFamily: "var(--font-heading)", fontSize: 18 }}>{plan?.name ?? "—"}</span>
              <span className={org.subscriptionStatus === "past_due" || org.subscriptionStatus === "canceled" ? "tag tag-outline" : "tag tag-accent"}>
                {tb(`status.${org.subscriptionStatus}`)}
              </span>
            </div>
            {plan && (
              <div style={{ fontSize: 13, color: "color-mix(in srgb,var(--color-text) 55%,transparent)", marginTop: 4 }}>
                {tb("priceLine", { price: (plan.priceCents / 100).toFixed(0) })}
              </div>
            )}
            {org.subscriptionStatus === "trialing" && trialDaysLeft !== null && (
              <div style={{ fontSize: 13, marginTop: 10, color: trialDaysLeft <= 5 ? "var(--color-accent-800)" : "var(--color-text)" }}>
                {trialDaysLeft > 0 ? tb("trialDaysLeft", { n: trialDaysLeft }) : tb("trialEnded")}
              </div>
            )}
          </div>

          <div style={{ fontFamily: "var(--font-heading)", fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: "color-mix(in srgb,var(--color-text) 55%,transparent)", marginBottom: 10 }}>
            {tb("usage")}
          </div>
          <UsageRow label={tb("usageUsers")} used={usage.users} max={plan?.maxUsers ?? null} />
          <UsageRow label={tb("usageFacilities")} used={usage.facilities} max={plan?.maxFacilities ?? null} />
          <UsageRow label={tb("usageBins")} used={usage.bins} max={plan?.maxBins ?? null} />

          <p className="text-muted" style={{ fontSize: 12, marginTop: 20 }}>
            {supportEmail ? tb("changePlanWithEmail", { email: supportEmail }) : tb("changePlan")}
          </p>
        </div>
      </div>
    </div>
  );
}
