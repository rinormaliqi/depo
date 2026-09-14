import { NextResponse } from "next/server";
import { auth } from "@/auth";

const publicPaths = new Set(["/", "/login", "/signup", "/forgot-password"]);
// Token-in-the-URL pages, reached by someone who isn't signed in yet (that's
// the whole point of an invite or reset link) — a prefix check, not an exact
// one, since the token itself varies per link.
const publicPrefixes = ["/invite/", "/reset-password/"];

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
