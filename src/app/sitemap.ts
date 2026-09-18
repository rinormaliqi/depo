import type { MetadataRoute } from "next";
import { appBaseUrl } from "@/lib/app-url";

// The indexable pages. Auth forms are reachable but pointless in search
// results, so they're left out; the app itself is behind a login.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = await appBaseUrl();
  const now = new Date();
  return [
    { url: `${site}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${site}/pricing`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${site}/contact`, lastModified: now, changeFrequency: "yearly", priority: 0.5 },
    { url: `${site}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${site}/refunds`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${site}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ];
}
