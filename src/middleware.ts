import { NextResponse } from "next/server";
import { auth } from "@/auth";

const publicPaths = new Set(["/", "/login", "/signup"]);

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isPublic = publicPaths.has(pathname) || pathname.startsWith("/api/auth");

  if (!isPublic && !req.auth) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }
});

// Everything except Next's own static/image assets goes through the check above,
// so new routes are protected by default instead of needing to opt in here.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
