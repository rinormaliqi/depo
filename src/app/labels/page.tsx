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

// One page of labels at a time: 240 is twenty A4 sheets of twelve 70×40 mm
// labels. Generating every QR at once took seconds and ~12 MB of HTML on a
// floor with 5 000 bins (#207); a page is a tenth of a second.
const PAGE_SIZE = 240;

// Labels are generated on request, nothing persisted (docs/architecture.md,
// "QR codes"). The QR encodes the bin's own URL rather than the bare code:
// a phone's stock camera app then opens the bin page directly, and the
// in-app scanner (#11) can pull the id off the end of the URL. The code is
// printed in large type next to it for eyes and for the typed-code fallback.
export default async function LabelsPage({
  searchParams,
}: {
  searchParams: Promise<{ bin?: string; parent?: string; page?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { bin, parent, page } = await searchParams;
  const scope: LabelScope = bin ? { kind: "bin", binId: bin } : parent ? { kind: "parent", parentId: parent } : { kind: "facility" };
  const [facility, { facilityName, title, bins, zones }, base, t] = await Promise.all([
    getMyFacility(),
    getLabelBins(scope),
    appBaseUrl(),
    getTranslations(),
  ]);

  const pageCount = Math.max(1, Math.ceil(bins.length / PAGE_SIZE));
  const pageNo = Math.min(pageCount, Math.max(1, Number.parseInt(page ?? "1", 10) || 1));
  const first = (pageNo - 1) * PAGE_SIZE;
  const pageHref = (n: number) => {
    const q = new URLSearchParams();
    if (bin) q.set("bin", bin);
    if (parent) q.set("parent", parent);
    if (n > 1) q.set("page", String(n));
    const qs = q.toString();
    return qs ? `/labels?${qs}` : "/labels";
  };
  // The page numbers worth a link: both ends and the neighbourhood of this one.
  const pageLinks = Array.from({ length: pageCount }, (_, i) => i + 1)
    .filter((n) => n === 1 || n === pageCount || Math.abs(n - pageNo) <= 2);

  const labels = await Promise.all(
    bins.slice(first, first + PAGE_SIZE).map(async (b) => ({
      ...b,
      // margin is in modules, and the spec asks for four of white around a
      // symbol or a scanner may not find its edges. At 30 mm across 37
      // modules one module is 0.81 mm, and the label's own padding left
      // about 2.5 mm above and below — a little over three. Carrying the
      // quiet zone inside the SVG makes it independent of whatever the
      // label box does around it.
      qr: await QRCode.toString(`${base}/builder/bin/${b.id}`, { type: "svg", margin: 4, errorCorrectionLevel: "M" }),
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
              {pageCount > 1 && <> · {t("labels.pageInfo", { page: pageNo, pages: pageCount, total: bins.length })}</>}
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

        {pageCount > 1 && (
          <div className="no-print labels-pager">
            <nav aria-label={t("labels.pages")} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
              {pageNo > 1 && <Link className="btn btn-secondary" href={pageHref(pageNo - 1)}>← {t("labels.prev")}</Link>}
              {pageLinks.map((n, i) => (
                <span key={n} style={{ display: "contents" }}>
                  {i > 0 && n - pageLinks[i - 1] > 1 && <span aria-hidden>…</span>}
                  <Link
                    className={n === pageNo ? "btn btn-primary" : "btn btn-ghost"}
                    href={pageHref(n)}
                    aria-current={n === pageNo ? "page" : undefined}
                    style={{ minWidth: 34, fontVariantNumeric: "tabular-nums" }}
                  >
                    {n}
                  </Link>
                </span>
              ))}
              {pageNo < pageCount && <Link className="btn btn-secondary" href={pageHref(pageNo + 1)}>{t("labels.next")} →</Link>}
            </nav>
            <p className="text-muted" style={{ fontSize: 12, margin: "8px 0 0" }}>{t("labels.pageHint")}</p>
            {zones.length > 1 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--color-accent)", marginBottom: 6 }}>{t("labels.byZone")}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {zones.map((z) => (
                    <Link key={z.id} className="btn btn-secondary" href={`/labels?parent=${z.id}`}>
                      {z.label} <span style={{ opacity: 0.6, fontVariantNumeric: "tabular-nums" }}>({z.count})</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

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
