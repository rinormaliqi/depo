import { defaultLocale, isLocale, type Locale } from "@/i18n/locales";

// URL-prefixed locales for the public pages: `/pricing` is Albanian (the
// default, no prefix), `/en/pricing` is English. The app behind the login
// stays cookie-only — those URLs are never indexed and a prefix there
// would only complicate every internal link. Edge-safe: no imports beyond
// the locale list, so the middleware can use it.
export const LOCALE_HEADER = "x-locale";

// Which public paths get a language version. Auth forms too, so a visitor
// who arrived on /en stays in English through signup.
export const LOCALIZED_PUBLIC_PATHS = new Set(["/", "/pricing", "/login", "/signup", "/forgot-password", "/terms", "/refunds", "/privacy", "/contact"]);

export function splitLocale(pathname: string): { locale: Locale | null; path: string } {
  const m = pathname.match(/^\/([a-z]{2})(?=\/|$)(.*)$/);
  if (m && isLocale(m[1]) && m[1] !== defaultLocale) return { locale: m[1], path: m[2] || "/" };
  return { locale: null, path: pathname };
}

export function localizedPath(locale: Locale, path: string): string {
  if (locale === defaultLocale) return path;
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

