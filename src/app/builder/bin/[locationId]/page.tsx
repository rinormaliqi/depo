import Link from "next/link";
import { redirect } from "next/navigation";
import { getFacilityLocations, getMyFacility } from "@/app/builder/actions";
import { getMyItems } from "@/app/items/actions";
import { auth } from "@/auth";
import { AppHeader } from "@/components/app-header";
import { locationLabel } from "@/lib/location-path";
import { getBinInfo, getBinStock } from "./actions";
import { StockForm } from "./stock-form";

export default async function BinPage({
  params,
}: {
  params: Promise<{ locationId: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { locationId } = await params;
  const bin = await getBinInfo(locationId);
  const facility = await getMyFacility();
  const [stockRows, myItems, allLocations] = await Promise.all([
    getBinStock(locationId),
    getMyItems(),
    facility ? getFacilityLocations(facility.id) : Promise.resolve([]),
  ]);
  const byId = new Map(allLocations.map((l) => [l.id, l]));
  const path = locationLabel(locationId, byId);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", minHeight: 0, overflow: "hidden" }}>
      {facility && (
        <AppHeader
          facilityName={facility.name}
          floorText={`${facility.widthM.toFixed(1)} × ${facility.heightM.toFixed(1)} m · metric`}
          userEmail={session.user.email ?? ""}
        />
      )}
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 26 }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <div style={{ marginBottom: 6 }}>
            <Link href="/builder" style={{ fontSize: 12, color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>
              ‹ Back to blueprint
            </Link>
          </div>
          <div style={{ fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--color-accent)" }}>Bin</div>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 28, letterSpacing: ".03em", marginBottom: 4 }}>{bin.code}</div>
          <div style={{ fontSize: 12, color: "color-mix(in srgb, var(--color-text) 55%, transparent)", marginBottom: 20 }}>{path}</div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            {stockRows.map((row) => (
              <div key={row.itemId} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--color-divider)", fontSize: 13 }}>
                <span>{row.name}</span>
                <span style={{ color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>{row.quantity} {row.unitOfMeasure}</span>
              </div>
            ))}
          </div>
          {stockRows.length === 0 && <p className="text-muted" style={{ fontSize: 13, marginBottom: 20 }}>Nothing stored here yet.</p>}

          <div style={{ height: 20 }} />

          {myItems.length === 0 ? (
            <p className="text-muted" style={{ fontSize: 13 }}>
              No items in your catalog yet —{" "}
              <Link href="/items" className="underline">
                add one
              </Link>{" "}
              first.
            </p>
          ) : (
            <StockForm locationId={locationId} items={myItems} />
          )}
        </div>
      </div>
    </div>
  );
}
