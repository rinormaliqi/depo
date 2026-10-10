// Response headers every page and route is served with (#194). Kept out of
// next.config.ts so a test can read them.
//
// What the app actually loads, and so what the policy allows:
// - scripts: our own bundle and Next's inline bootstrap. 'unsafe-inline'
//   stays because a per-request nonce would force every static page
//   (landing, pricing, legal) into dynamic rendering. Vercel Analytics and
//   the Sentry tunnel (/monitoring) are same-origin.
// - styles: our CSS, inline style attributes, and Google Fonts' stylesheet
//   (src/app/ds.css); the font files come from fonts.gstatic.com.
// - images: our own, data: (inline icons) and blob: (the underlay preview
//   built with URL.createObjectURL before upload).
// - forms: our own server actions. Signing in with Google and paying
//   through Paysera end in a redirect to those sites, which Chrome checks
//   against form-action when JavaScript is off and the form posts plainly.
// - nothing embeds us and we embed nothing.
// The scanner's camera is allowed for our own origin only.

export const PAYSERA_ORIGIN = "https://bank.paysera.com";
export const GOOGLE_ACCOUNTS_ORIGIN = "https://accounts.google.com";

export function contentSecurityPolicy({ dev }: { dev: boolean }) {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // Dev only: React's dev build evaluates code, and @vercel/analytics
    // loads its debug script from Vercel's CDN outside production.
    "script-src": ["'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'", "https://va.vercel-scripts.com"] : [])],
    "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    "font-src": ["'self'", "https://fonts.gstatic.com", "data:"],
    "img-src": ["'self'", "data:", "blob:"],
    "connect-src": ["'self'", ...(dev ? ["ws:", "wss:"] : [])],
    "media-src": ["'self'", "blob:"],
    "worker-src": ["'self'", "blob:"],
    "frame-src": ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'", GOOGLE_ACCOUNTS_ORIGIN, PAYSERA_ORIGIN],
    "frame-ancestors": ["'none'"],
  };
  const policy = Object.entries(directives).map(([k, v]) => `${k} ${v.join(" ")}`);
  // A dev server on plain http://localhost must not be told to upgrade.
  if (!dev) policy.push("upgrade-insecure-requests");
  return policy.join("; ");
}

export function securityHeaders({ dev }: { dev: boolean }) {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy({ dev }) },
    // Two years, subdomains included. No `preload`: that is a commitment
    // for the production domain to make once it exists (PRE-1).
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
    // frame-ancestors above is the modern form; this covers older browsers.
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), browsing-topics=()",
    },
    // Google sign-in is a full-page redirect, not a popup, so nothing needs
    // a window handle across origins.
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ];
}
