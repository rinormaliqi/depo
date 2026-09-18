import type { MetadataRoute } from "next";
import { appBaseUrl } from "@/lib/app-url";
import { locales } from "@/i18n/locales";
import { localizedPath } from "@/lib/locale-path";

// The indexable pages. Auth forms are reachable but pointless in search
// results, so they're left out; the app itself is behind a login.
const PAGES: { path: string; changeFrequency: "weekly" | "monthly" | "yearly"; priority: number }[] = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/pricing", changeFrequency: "monthly", priority: 0.9 },
  { path: "/contact", changeFrequency: "yearly", priority: 0.5 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.2 },
  { path: "/refunds", changeFrequency: "yearly", priority: 0.2 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.2 },
];

// One entry per page per language, each naming the others as alternates.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = await appBaseUrl();
  const now = new Date();
  return PAGES.flatMap((page) =>
    locales.map((locale) => ({
      url: `${site}${localizedPath(locale, page.path)}`,
      lastModified: now,
      changeFrequency: page.changeFrequency,
      priority: page.priority,
      alternates: { languages: Object.fromEntries(locales.map((l) => [l, `${site}${localizedPath(l, page.path)}`])) },
    })),
  );
}
