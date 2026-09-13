import { redirect } from "next/navigation";
import { getMyFacility } from "@/app/builder/actions";
import { auth } from "@/auth";
import { AppHeader } from "@/components/app-header";
import { getMyItems } from "./actions";
import { ItemForm } from "./item-form";

export default async function ItemsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [facility, myItems] = await Promise.all([getMyFacility(), getMyItems()]);

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
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 20, marginBottom: 16 }}>Items</div>

          <ItemForm />

          <div style={{ marginTop: 20, display: "flex", flexDirection: "column" }}>
            {myItems.map((item) => (
              <div
                key={item.id}
                style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--color-divider)", fontSize: 13 }}
              >
                <span>{item.name}</span>
                <span style={{ color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>
                  {item.unitOfMeasure}
                  {item.category ? ` · ${item.category}` : ""}
                </span>
              </div>
            ))}
          </div>

          {myItems.length === 0 && (
            <p className="text-muted" style={{ marginTop: 20, textAlign: "center", fontSize: 13 }}>No items yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
