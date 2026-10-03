import { eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getMyFacility } from "@/app/builder/actions";
import { auth } from "@/auth";
import { AppHeader } from "@/components/app-header";
import { BlockedPage } from "@/components/blocked-page";
import { db } from "@/db";
import { organizations, plans } from "@/db/schema";
import { CONTRACT_PERIODS, contractPriceBreakdown, isContractMonths } from "@/lib/billing-plans";
import { getCapabilities } from "@/lib/capabilities";
import { requireSession } from "@/lib/session";
import { getMyContractsForOrg } from "./actions";
import { ContractFlow } from "./contract-flow";

export default async function ContractPage({ searchParams }: { searchParams: Promise<{ months?: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const capsGate = await getCapabilities();
  if (!capsGate?.can.manageBilling) return <BlockedPage capability="manageBilling" reason={capsGate?.reason.manageBilling} />;

  const t = await getTranslations();
  const { organizationId } = await requireSession();
  // The period comes from the button picked on /billing; anything else
  // (a hand-edited URL, an old bookmark) falls back to the 12-month offer.
  const requested = Number((await searchParams).months);
  const months = isContractMonths(requested) ? requested : 12;
  const [facility, [org], [plan], contracts] = await Promise.all([
    getMyFacility(),
    db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, organizationId)),
    db.select().from(plans).where(eq(plans.key, "business")),
    getMyContractsForOrg(),
  ]);

  if (!plan) {
    return (
      <main style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
        <p className="text-muted">{t("contract.errorPlanNotEligible")}</p>
      </main>
    );
  }

  const pricing = contractPriceBreakdown(plan, months);
  // One contract per period: a draft or signed 12-month contract doesn't
  // block starting a 3-month one, but reopening the same period shows the
  // contract already generated for it instead of a second blank form.
  const existing = contracts.find((c) => c.months === months) ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", minHeight: 0, overflow: "hidden" }}>
      {facility && (
        <AppHeader
          facilityId={facility.id}
          facilityName={facility.name}
          floorText={t("common.floorText", { width: facility.widthM.toFixed(1), height: facility.heightM.toFixed(1) })}
          userEmail={session.user.email ?? ""}
        />
      )}
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 26 }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 20, marginBottom: 4 }}>{t("contract.title", { n: months })}</div>
          <p className="text-muted" style={{ fontSize: 13, marginBottom: 20 }}>{t(months === 12 ? "contract.subtitleDiscount" : "contract.subtitle", { plan: plan.name })}</p>
          <div className="seg" style={{ marginBottom: 16 }}>
            {CONTRACT_PERIODS.map((m) => (
              <Link
                key={m}
                href={`/billing/contract?months=${m}`}
                className="seg-opt"
                style={{ background: months === m ? "var(--color-accent)" : undefined, color: months === m ? "var(--color-bg)" : undefined }}
              >
                {t("billing.months", { n: m })}
              </Link>
            ))}
          </div>
          <ContractFlow
            key={months}
            planKey="business"
            months={months}
            planName={plan.name}
            pricing={pricing}
            defaultLegalName={org?.name ?? ""}
            defaultContactEmail={session.user.email ?? ""}
            existing={existing}
          />
        </div>
      </div>
    </div>
  );
}
