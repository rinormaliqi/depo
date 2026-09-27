import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getFacilityLocations, getMyFacility } from "@/app/builder/actions";
import { getMyItems } from "@/app/items/actions";
import { auth } from "@/auth";
import { AppHeader } from "@/components/app-header";
import { ReasonChip } from "@/components/reason-chip";
import { getCapabilities } from "@/lib/capabilities";
import { locationLabel } from "@/lib/location-path";
import { getBinHistory, getBinInfo, getBinStock, getOtherBinCodes } from "./actions";
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
  // The header shows the facility the user is *in*; the path is resolved
  // against the facility the bin actually belongs to — a link from a
  // search or QR label can open a bin in another site.
  const facility = await getMyFacility();
  const [stockRows, myItems, allLocations, t, caps, otherBinCodes, history] = await Promise.all([
    getBinStock(locationId),
    getMyItems(),
    getFacilityLocations(bin.facilityId),
    getTranslations(),
    getCapabilities(),
    getOtherBinCodes(locationId),
    getBinHistory(locationId),
  ]);
  const byId = new Map(allLocations.map((l) => [l.id, l]));
  const path = locationLabel(locationId, byId);

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
      <div className="bin-page" style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <div style={{ marginBottom: 6 }}>
            <Link href="/builder" style={{ fontSize: 12, color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>
              {t("common.backToBlueprint")}
            </Link>
          </div>
          <div style={{ fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--color-accent)" }}>{t("bin.kicker")}</div>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 28, letterSpacing: ".03em", marginBottom: 4 }}>{bin.code}</div>
          <div style={{ fontSize: 12, color: "color-mix(in srgb, var(--color-text) 55%, transparent)", marginBottom: 6 }}>{path}</div>
          {caps?.can.printLabels && (
            <div style={{ marginBottom: 20 }}>
              <Link href={`/labels?bin=${locationId}`} style={{ fontSize: 12 }} className="underline">
                {t("bin.printLabel")}
              </Link>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column" }}>
            {stockRows.map((row) => (
              <div key={row.itemId} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--color-divider)", fontSize: 13 }}>
                <span>{row.name}</span>
                <span style={{ color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>{row.quantity} {row.unitOfMeasure}</span>
              </div>
            ))}
          </div>
          {stockRows.length === 0 && <p className="text-muted" style={{ fontSize: 13, marginBottom: 20 }}>{t("bin.nothingStored")}</p>}

          <div style={{ height: 20 }} />

          {myItems.length === 0 ? (
            <p className="text-muted" style={{ fontSize: 13 }}>
              {t("bin.noItemsYet")}{" "}
              <Link href="/items" className="underline">
                {t("bin.addOne")}
              </Link>{" "}
              {t("bin.first")}
            </p>
          ) : (
            <StockForm locationId={locationId} items={myItems} otherBinCodes={otherBinCodes} />
          )}

          <div style={{ height: 28 }} />

          <div style={{ fontFamily: "var(--font-heading)", fontSize: 13, letterSpacing: ".16em", textTransform: "uppercase", marginBottom: 11 }}>
            {t("bin.history")}
          </div>
          {history.length === 0 ? (
            <p className="text-muted" style={{ fontSize: 13 }}>{t("bin.noHistory")}</p>
          ) : (
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t("metrics.when")}</th><th>{t("metrics.move")}</th><th>{t("metrics.item")}</th>
                    <th style={{ textAlign: "right" }}>{t("metrics.qty")}</th><th>{t("metrics.from")}</th><th>{t("metrics.to")}</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((m) => (
                    <tr key={m.id}>
                      <td style={{ fontVariantNumeric: "tabular-nums", fontSize: 12, whiteSpace: "nowrap" }}>{m.when}</td>
                      <td><ReasonChip reason={m.reason} label={t(`common.reason.${m.reason}` as "common.reason.receive")} /></td>
                      <td style={{ fontSize: 12 }}>{m.itemName}</td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 12 }}>{m.quantity}</td>
                      <td style={{ fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{m.from}</td>
                      <td style={{ fontSize: 12, fontVariantNumeric: "tabular-nums", color: "var(--color-accent-700)" }}>{m.to}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
