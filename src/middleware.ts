import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

// Edge-safe Auth.js instance: JWT decoding only, no database (see
// src/auth.config.ts). The full instance in src/auth.ts is for pages
// and server actions.
const { auth } = NextAuth(authConfig);

const publicPaths = new Set(["/", "/login", "/signup", "/forgot-password", "/pricing", "/terms", "/refunds", "/contact"]);
// Token-in-the-URL pages, reached by someone who isn't signed in yet (that's
// the whole point of an invite or reset link) — a prefix check, not an exact
// one, since the token itself varies per link.
// /api/billing/paysera/ is hit by Paysera's servers, which have no session;
// the route verifies its own signature instead.
// /paysera_<code>.html is the static site-ownership file Paysera fetches.
const publicPrefixes = ["/invite/", "/reset-password/", "/verify-email/", "/api/billing/paysera/", "/paysera_"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isPublic =
    publicPaths.has(pathname) ||
    publicPrefixes.some((prefix) => pathname.startsWith(prefix)) ||
    pathname.startsWith("/api/auth");

  if (!isPublic && !req.auth) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }
});

// Everything except Next's own static/image assets goes through the check above,
// so new routes are protected by default instead of needing to opt in here.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
