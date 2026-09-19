import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getMyFacility } from "@/app/builder/actions";
import { auth } from "@/auth";
import { AppHeader } from "@/components/app-header";
import { getCapabilities } from "@/lib/capabilities";
import { getMyItems } from "./actions";
import { ItemForm } from "./item-form";

export default async function ItemsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [facility, myItems, caps, t] = await Promise.all([
    getMyFacility(),
    getMyItems(),
    getCapabilities(),
    getTranslations(),
  ]);

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
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 20, marginBottom: 16 }}>{t("items.title")}</div>

          {caps?.can.manageItems ? (
            <ItemForm />
          ) : (
            <p className="text-muted" style={{ fontSize: 12 }}>{t("items.viewOnly")}</p>
          )}

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
            <p className="text-muted" style={{ marginTop: 20, textAlign: "center", fontSize: 13 }}>{t("items.noItems")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
