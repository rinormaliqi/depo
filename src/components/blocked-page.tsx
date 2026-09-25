import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { getMyFacility } from "@/app/builder/actions";
import { auth } from "@/auth";
import type { BlockReason, Capability } from "@/lib/capabilities";
import { blockMessage, getCapabilities } from "@/lib/capabilities";
import { homeFor } from "@/lib/navigation";

// A page the person can't use right now: the normal header so they stay
// oriented, one calm line saying why, and the way on — not an error.
//
// `reason` matters. resolveCapabilities() already works out whether a
// capability is off for the role, the plan or a billing lock, and
// blockMessage() has the copy for each; without it every block read as
// "not for your role", so a locked admin was told this page belonged to
// someone else's job, directly under a banner saying their trial had
// ended. It is optional only because a page may have no capabilities
// loaded at all, in which case the role wording is the safe default.
export async function BlockedPage({ capability, reason }: { capability: Capability; reason?: BlockReason }) {
  const [t, session, facility, caps] = await Promise.all([getTranslations(), auth(), getMyFacility(), getCapabilities()]);
  const lock = reason?.kind === "locked" ? reason.lock : null;
  const body = reason ? await blockMessage(reason, capability) : t(`permission.${capability}`);

  // Only an admin can lift a lock, and only they are shown the way to do
  // it — the same split LockBanner makes, so the two agree on screen.
  const canFix = lock !== null && caps?.can.manageBilling;
  const fixHref = lock === "unverified" ? "/verify-email" : "/billing";

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      {facility && session?.user && (
        <AppHeader
          facilityId={facility.id}
          facilityName={facility.name}
          floorText={t("common.floorText", { width: facility.widthM.toFixed(1), height: facility.heightM.toFixed(1) })}
          userEmail={session.user.email ?? ""}
        />
      )}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center", gap: 10 }}>
        <div className="lp-kicker">{lock ? t(`lockBanner.title.${lock}`) : t("notForRole.kicker")}</div>
        <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 24, margin: 0 }}>
          {lock ? t(`lockBanner.admin.${lock}`) : t("notForRole.title")}
        </h1>
        <p className="text-muted" style={{ maxWidth: 420, fontSize: 14, lineHeight: 1.6, margin: "4px 0 12px" }}>{body}</p>
        {canFix ? (
          <Link href={fixHref} className="btn btn-primary">
            {t(lock === "unverified" ? "lockBanner.verifyCta" : "lockBanner.billingCta")}
          </Link>
        ) : (
          <Link href={homeFor(caps?.role ?? "worker")} className="btn btn-primary">{t("notForRole.back")}</Link>
        )}
      </main>
    </div>
  );
}
