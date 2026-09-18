// The public/protected split of the URL space, in one place so the
// middleware and a test can agree on it. Edge-safe: no imports.
//
// Public: the marketing and legal pages, the auth forms, and the
// token-in-the-URL pages (an invite or reset link is opened by someone
// who isn't signed in yet — that's the point). Everything under a
// protected prefix needs a session. Anything else is neither — it falls
// through to Next's 404 instead of bouncing a mistyped URL to /login.
export const publicPaths = new Set([
  "/", "/login", "/signup", "/forgot-password", "/pricing", "/terms", "/refunds", "/privacy", "/contact",
  "/robots.txt", "/sitemap.xml",
]);

// /api/billing/paysera/ is hit by Paysera's servers, which have no session;
// the route verifies its own signature. /paysera_<code>.html is the static
// site-ownership file Paysera fetches. /monitoring is Sentry's tunnel
// (next.config.ts). /icon, /apple-icon and /opengraph-image are the
// metadata files Next serves from src/app.
export const publicPrefixes = [
  "/invite/", "/reset-password/", "/verify-email/", "/api/auth", "/api/billing/paysera/", "/paysera_", "/monitoring",
  "/icon", "/apple-icon", "/opengraph-image",
];

// Every top-level app route. src/tests/routes.test.ts checks that each
// directory under src/app with a page is either public or listed here,
// so a new route can't ship unprotected by forgetting this list.
export const protectedPrefixes = [
  "/billing", "/builder", "/internal", "/items", "/labels", "/metrics", "/scanner", "/stock", "/team", "/verify-email", "/welcome",
];

export function routeAccess(pathname: string): "public" | "protected" | "unknown" {
  if (publicPaths.has(pathname) || publicPrefixes.some((p) => pathname.startsWith(p))) return "public";
  if (protectedPrefixes.some((p) => pathname === p || pathname.startsWith(p + "/"))) return "protected";
  return "unknown";
}
