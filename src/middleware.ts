import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";
import { defaultLocale, isLocale, localeCookieName } from "@/i18n/locales";
import { LOCALE_HEADER, LOCALIZED_PUBLIC_PATHS, localizedPath, splitLocale } from "@/lib/locale-path";
import { routeAccess } from "@/lib/routes";

// Edge-safe Auth.js instance: JWT decoding only, no database (see
// src/auth.config.ts). The full instance in src/auth.ts is for pages
// and server actions.
const { auth } = NextAuth(authConfig);

// Two jobs, in order:
//
// 1. Locale in the URL for the public pages (src/lib/locale-path.ts):
//    `/en/pricing` is rewritten to `/pricing` with an `x-locale: en`
//    header that src/i18n/request.ts reads ahead of the cookie, and the
//    cookie is set so the app behind the login follows. A public path
//    reached *without* a prefix while the cookie says English redirects
//    to its `/en` twin, so English content only ever lives at one URL —
//    what canonical/hreflang promise. Crawlers carry no cookie, so `/`
//    is always Albanian for them. `/en/<app page>` just drops the prefix.
//
// 2. Which paths are public, protected or neither lives in
//    src/lib/routes.ts, with a test that keeps the protected list in
//    step with src/app. An unknown path is left alone so it 404s rather
//    than redirecting a typo — or a crawler's robots.txt fetch — to /login.
export default auth((req) => {
  const { pathname, search } = req.nextUrl;
  const { locale: prefixed, path } = splitLocale(pathname);

  if (prefixed) {
    if (!LOCALIZED_PUBLIC_PATHS.has(path)) {
      return NextResponse.redirect(new URL(path + search, req.nextUrl));
    }
    const headers = new Headers(req.headers);
    headers.set(LOCALE_HEADER, prefixed);
    const res = NextResponse.rewrite(new URL(path + search, req.nextUrl), { request: { headers } });
    res.cookies.set(localeCookieName, prefixed, { maxAge: 60 * 60 * 24 * 365, path: "/" });
    return res;
  }

  if (LOCALIZED_PUBLIC_PATHS.has(pathname)) {
    const cookie = req.cookies.get(localeCookieName)?.value;
    if (isLocale(cookie) && cookie !== defaultLocale) {
      return NextResponse.redirect(new URL(localizedPath(cookie, pathname) + search, req.nextUrl));
    }
    return;
  }

  if (routeAccess(pathname) === "protected" && !req.auth) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
