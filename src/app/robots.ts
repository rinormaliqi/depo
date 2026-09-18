import type { MetadataRoute } from "next";
import { appBaseUrl } from "@/lib/app-url";
import { protectedPrefixes } from "@/lib/routes";

// Host from the request (appBaseUrl) rather than an env var, same as
// email links — so previews and the eventual custom domain each point
// at their own sitemap.
export default async function robots(): Promise<MetadataRoute.Robots> {
  return {
    rules: { userAgent: "*", allow: "/", disallow: [...protectedPrefixes.map((p) => `${p}/`), ...protectedPrefixes, "/api/"] },
    sitemap: `${await appBaseUrl()}/sitemap.xml`,
  };
}
