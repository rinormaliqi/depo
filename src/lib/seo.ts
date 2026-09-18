import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { appBaseUrl } from "@/lib/app-url";
import { locales } from "@/i18n/locales";
import { localizedPath } from "@/lib/locale-path";

// Search and share metadata for the public pages. All copy lives under
// `meta` in messages/*.json so the Albanian pages carry Albanian titles
// and descriptions (the primary market — "menaxhim depoje", not
// "warehouse management" — is what people there type into Google), and
// the English ones English. Public pages have one URL per language
// (src/lib/locale-path.ts: `/pricing` sq, `/en/pricing` en), so each
// carries its own canonical and hreflang links to the other.
export const PUBLIC_PAGE_KEYS = ["home", "pricing", "login", "signup", "forgotPassword", "terms", "refunds", "privacy", "contact"] as const;
export type PublicPageKey = (typeof PUBLIC_PAGE_KEYS)[number];

const OG_LOCALE: Record<string, string> = { sq: "sq_AL", en: "en_US" };

export async function siteMetadata(): Promise<Metadata> {
  const [t, locale, base] = await Promise.all([getTranslations("meta"), getLocale(), appBaseUrl()]);
  return {
    metadataBase: new URL(base),
    title: { default: t("title"), template: `%s · ${t("siteName")}` },
    description: t("description"),
    keywords: t("keywords").split(",").map((k) => k.trim()),
    applicationName: t("siteName"),
    openGraph: {
      type: "website",
      siteName: t("siteName"),
      locale: OG_LOCALE[locale] ?? "sq_AL",
      title: t("title"),
      description: t("description"),
      images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: t("ogAlt") }],
    },
    twitter: { card: "summary_large_image", title: t("title"), description: t("description") },
    robots: { index: true, follow: true },
  };
}

// Per-page title + description; the layout's template appends the site
// name. `path` becomes the canonical URL, so the same page reached
// with a query string (e.g. /login?next=…) still points at itself.
export async function pageMetadata(key: PublicPageKey, path: string): Promise<Metadata> {
  const [t, locale] = await Promise.all([getTranslations("meta"), getLocale()]);
  const title = t(`pages.${key}.title`);
  const description = t(`pages.${key}.description`);
  const canonical = localizedPath(locale as (typeof locales)[number], path);
  const languages = Object.fromEntries(locales.map((l) => [l, localizedPath(l, path)]));
  return {
    // The home page carries the full brand-first site title ("SmartDepo —
    // …") instead of "<page> · SmartDepo"; every other page gets the template.
    title: key === "home" ? { absolute: t("title") } : title,
    description,
    alternates: { canonical, languages: { ...languages, "x-default": path } },
    openGraph: { title, description, url: canonical, alternateLocale: locales.filter((l) => l !== locale).map((l) => OG_LOCALE[l]) },
    twitter: { title, description },
  };
}

// Pages that only make sense for the person they were sent to.
export const NOINDEX: Metadata = { robots: { index: false, follow: false } };
