import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppHeader } from "@/components/app-header";
import { getBlueprint, getMyFacility } from "./actions";
import { BlueprintCanvas } from "./blueprint-canvas";

export default async function BuilderPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const facility = await getMyFacility();

  if (!facility) {
    return (
      <main style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
        <p className="text-muted">No facility found for your organization yet.</p>
      </main>
    );
  }

  const { locations, occupiedBinIds } = await getBlueprint(facility.id);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", minHeight: 0, overflow: "hidden" }}>
      <AppHeader
        facilityName={facility.name}
        floorText={`${facility.widthM.toFixed(1)} × ${facility.heightM.toFixed(1)} m · metric`}
        userEmail={session.user.email ?? ""}
      />
      <BlueprintCanvas
        facility={{ id: facility.id, name: facility.name, widthM: facility.widthM, heightM: facility.heightM }}
        initialLocations={locations}
        initialOccupiedBinIds={occupiedBinIds}
      />
    </div>
  );
}
