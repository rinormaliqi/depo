import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { BlueprintCanvas } from "@/app/builder/blueprint-canvas";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { getViewAsData } from "../view-as-actions";
import { ItemsTable } from "./items-table";
import { ViewAsBanner } from "./view-as-banner";

// Read-only support surface (Epic A3): deliberately its own page tree, not
// the real /builder or /items — those pages' mutation actions are gated
// by the *caller's own* session org (requireOwnedFacility() etc.), which
// almost never matches the org being viewed, but this page also never
// renders any mutation UI in the first place, so there's no path to a
// write action to begin with. See src/lib/view-as.ts for the session
// mechanism (time-boxed, audit-logged, cookie only holds an opaque id).
export default async function ViewAsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await isPlatformAdmin())) redirect("/builder");

  const result = await getViewAsData();
  if (!result.ok) redirect("/internal");
  const { organizationName, expiresAt, facility, blueprint, items } = result.value;

  return (
    <div>
      <ViewAsBanner organizationName={organizationName} expiresAt={expiresAt} />
      <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ fontFamily: "var(--font-heading)", fontSize: 18, marginBottom: 12 }}>Schema</div>
        {facility && blueprint ? (
          <div style={{ height: 520, border: "1px solid var(--color-divider)", borderRadius: 8, overflow: "hidden" }}>
            <BlueprintCanvas
              key={facility.id}
              facility={{ id: facility.id, name: facility.name, widthM: facility.widthM, heightM: facility.heightM }}
              initialLocations={blueprint.locations}
              initialOccupiedBinIds={blueprint.occupiedBinIds}
              initialBinStock={blueprint.binStock}
              initialLowStockBinIds={blueprint.lowStockBinIds}
              initialLevels={blueprint.levels}
              initialUnderlay={blueprint.underlay}
              readOnly
            />
          </div>
        ) : (
          <p className="text-muted" style={{ fontSize: 13 }}>No facility set up yet.</p>
        )}

        <div style={{ fontFamily: "var(--font-heading)", fontSize: 18, margin: "24px 0 12px" }}>Items</div>
        <ItemsTable items={items} />
      </div>
    </div>
  );
}
