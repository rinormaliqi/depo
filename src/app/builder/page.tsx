import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { AppHeader } from "@/components/app-header";
import { getMyPermissions } from "@/lib/permissions";
import { getMySession } from "@/lib/session";
import { getBlueprint, getMyFacility } from "./actions";
import { BlueprintCanvas } from "./blueprint-canvas";

export default async function BuilderPage({
  searchParams,
}: {
  searchParams: Promise<{ bin?: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { bin } = await searchParams;
  // Signed in but not yet in any organization (a Google sign-in that
  // hasn't named its company): finish onboarding first.
  if (!(await getMySession())) redirect("/welcome");
  const facility = await getMyFacility();
  const t = await getTranslations();

  if (!facility) {
    return (
      <main style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
        <p className="text-muted">{t("common.noFacility")}</p>
      </main>
    );
  }

  const [{ locations, occupiedBinIds }, permissions] = await Promise.all([getBlueprint(facility.id), getMyPermissions()]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", minHeight: 0, overflow: "hidden" }}>
      <AppHeader
        facilityId={facility.id}
          facilityName={facility.name}
        floorText={t("common.floorText", { width: facility.widthM.toFixed(1), height: facility.heightM.toFixed(1) })}
        userEmail={session.user.email ?? ""}
      />
      <BlueprintCanvas
        // Remount on facility change: the canvas seeds its own state from
        // these props once, and router.refresh() alone wouldn't reset it.
        key={facility.id}
        facility={{ id: facility.id, name: facility.name, widthM: facility.widthM, heightM: facility.heightM }}
        initialLocations={locations}
        initialOccupiedBinIds={occupiedBinIds}
        initialHighlightBinId={bin}
        readOnly={!permissions.editLayout}
      />
    </div>
  );
}
