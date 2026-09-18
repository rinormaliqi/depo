import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";
import { routeAccess } from "@/lib/routes";

// Edge-safe Auth.js instance: JWT decoding only, no database (see
// src/auth.config.ts). The full instance in src/auth.ts is for pages
// and server actions.
const { auth } = NextAuth(authConfig);

// Which paths are public, protected or neither lives in src/lib/routes.ts,
// with a test that keeps the protected list in step with src/app. An
// unknown path is left alone so it 404s (src/app/not-found.tsx) rather
// than redirecting a typo — or a crawler's robots.txt fetch — to /login.
export default auth((req) => {
  if (routeAccess(req.nextUrl.pathname) === "protected" && !req.auth) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
