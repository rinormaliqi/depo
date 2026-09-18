import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";

// The share card: the wordmark and the one-line pitch in the page's
// language, on the site's off-white with the ink-blue accent. Rendered
// on request with next/og — no image file to keep in sync with copy.
export const alt = "SmartDepo";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  const t = await getTranslations("meta");
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between",
          padding: 72, background: "#f2f2f3", color: "#1d1f20", fontFamily: "sans-serif",
          backgroundImage: "linear-gradient(to right, #eef6ff 0 2px, transparent 2px), linear-gradient(to bottom, #eef6ff 0 2px, transparent 2px)",
          backgroundSize: "60px 60px",
        }}
      >
        <div style={{ display: "flex", fontSize: 44, fontWeight: 700, letterSpacing: 4 }}>
          SMART<span style={{ color: "#5980a6" }}>/</span>DEPO
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", fontSize: 64, fontWeight: 700, lineHeight: 1.05, maxWidth: 1000 }}>{t("pages.home.title")}</div>
          <div style={{ display: "flex", fontSize: 28, color: "#5d5d60", maxWidth: 1000, lineHeight: 1.35 }}>{t("ogAlt")}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 22, color: "#5980a6", letterSpacing: 3 }}>
          <span>QR · {t("siteName").toUpperCase()}</span>
          <span>KOSOVË · SHQIPËRI</span>
        </div>
      </div>
    ),
    size,
  );
}
