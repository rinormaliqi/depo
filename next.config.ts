import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {};

// withSentryConfig only uploads source maps when SENTRY_AUTH_TOKEN (+ org,
// project) is set at build time; without it the build is unchanged apart
// from the runtime SDK. Errors still report — just with minified frames.
export default withSentryConfig(withNextIntl(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  webpack: { treeshake: { removeDebugLogging: true } },
  // Route SDK traffic through our own origin so ad blockers don't eat error reports.
  tunnelRoute: "/monitoring",
});
