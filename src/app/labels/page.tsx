import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import QRCode from "qrcode";
import { getMyFacility } from "@/app/builder/actions";
import { auth } from "@/auth";
import { AppHeader } from "@/components/app-header";
import { appBaseUrl } from "@/lib/app-url";
import { getLabelBins, type LabelScope } from "./actions";
import { PrintButton } from "./print-button";

// Labels are generated on request, nothing persisted (docs/architecture.md,
// "QR codes"). The QR encodes the bin's own URL rather than the bare code:
// a phone's stock camera app then opens the bin page directly, and the
// in-app scanner (#11) can pull the id off the end of the URL. The code is
// printed in large type next to it for eyes and for the typed-code fallback.
export default async function LabelsPage({
  searchParams,
}: {
  searchParams: Promise<{ bin?: string; parent?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { bin, parent } = await searchParams;
  const scope: LabelScope = bin ? { kind: "bin", binId: bin } : parent ? { kind: "parent", parentId: parent } : { kind: "facility" };
  const [facility, { facilityName, title, bins }, base, t] = await Promise.all([
    getMyFacility(),
    getLabelBins(scope),
    appBaseUrl(),
    getTranslations(),
  ]);

  const labels = await Promise.all(
    bins.map(async (b) => ({
      ...b,
      qr: await QRCode.toString(`${base}/builder/bin/${b.id}`, { type: "svg", margin: 0, errorCorrectionLevel: "M" }),
    })),
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      {facility && (
        <div className="no-print">
          <AppHeader
            facilityId={facility.id}
            facilityName={facility.name}
            floorText={t("common.floorText", { width: facility.widthM.toFixed(1), height: facility.heightM.toFixed(1) })}
            userEmail={session.user.email ?? ""}
          />
        </div>
      )}
      <div className="labels-page">
        <div className="no-print" style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
          <div>
            <div style={{ marginBottom: 6 }}>
              <Link href={bin ? `/builder/bin/${bin}` : "/builder"} style={{ fontSize: 12, color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>
                {bin ? t("labels.backToBin") : t("common.backToBlueprint")}
              </Link>
            </div>
            <div style={{ fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--color-accent)" }}>{t("labels.kicker")}</div>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 28, letterSpacing: ".03em" }}>{title}</div>
            <div style={{ fontSize: 12, color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>
              {t("labels.count", { n: labels.length })}
              {scope.kind !== "facility" && (
                <>
                  {" · "}
                  <Link href="/labels" className="underline">{t("labels.printWholeFacility")}</Link>
                </>
              )}
            </div>
          </div>
          {labels.length > 0 && <PrintButton />}
        </div>

        {labels.length === 0 ? (
          <p className="text-muted" style={{ fontSize: 13 }}>{t("labels.empty")}</p>
        ) : (
          <div className="label-sheet">
            {labels.map((l) => (
              <div key={l.id} className="label">
                <div className="label-text">
                  <div className="label-facility">{facilityName}</div>
                  <div className="label-code">{l.code}</div>
                  <div className="label-path">{l.path}</div>
                </div>
                <div className="label-qr" dangerouslySetInnerHTML={{ __html: l.qr }} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
