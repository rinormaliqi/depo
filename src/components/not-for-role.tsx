import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { getMyFacility } from "@/app/builder/actions";
import { auth } from "@/auth";
import type { Capability } from "@/lib/capabilities";
import { getCapabilities } from "@/lib/capabilities";
import { homeFor } from "@/lib/navigation";

// A page a role can't use (a worker typing /team): the normal header so
// they stay oriented, one calm line, and the way back — not an error.
export async function NotForRole({ capability }: { capability: Capability }) {
  const [t, session, facility, caps] = await Promise.all([getTranslations(), auth(), getMyFacility(), getCapabilities()]);
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
        <div className="lp-kicker">{t("notForRole.kicker")}</div>
        <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 24, margin: 0 }}>{t("notForRole.title")}</h1>
        <p className="text-muted" style={{ maxWidth: 420, fontSize: 14, lineHeight: 1.6, margin: "4px 0 12px" }}>
          {t(`permission.${capability}`)}
        </p>
        <Link href={homeFor(caps?.role ?? "worker")} className="btn btn-primary">{t("notForRole.back")}</Link>
      </main>
    </div>
  );
}
