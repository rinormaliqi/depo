import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getMyFacility } from "@/app/builder/actions";
import { auth } from "@/auth";
import { NotForRole } from "@/components/not-for-role";
import { AppHeader } from "@/components/app-header";
import { getCapabilities } from "@/lib/capabilities";
import { getMyItemsWithStock } from "./actions";
import { ItemForm } from "./item-form";
import { ItemsList } from "./items-list";

export default async function ItemsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const capsGate = await getCapabilities();
  if (!capsGate?.can.manageItems) return <NotForRole capability="manageItems" />;

  const [facility, myItems, caps, t] = await Promise.all([
    getMyFacility(),
    getMyItemsWithStock(),
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginBottom: 16 }}>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 20 }}>{t("items.title")}</div>
            {caps?.can.manageItems && (
              <div style={{ display: "flex", gap: 4 }}>
                <a href="/items/export" className="btn btn-ghost" download>
                  {t("items.exportLink")}
                </a>
                <Link href="/items/import" className="btn btn-ghost">
                  {t("items.importLink")}
                </Link>
              </div>
            )}
          </div>

          {caps?.can.manageItems ? (
            <ItemForm />
          ) : (
            <p className="text-muted" style={{ fontSize: 12 }}>{t("items.viewOnly")}</p>
          )}

          <ItemsList items={myItems} canManage={!!caps?.can.manageItems} />

          {myItems.length === 0 && (
            <p className="text-muted" style={{ marginTop: 20, textAlign: "center", fontSize: 13 }}>{t("items.noItems")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
