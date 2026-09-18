import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import en from "../../messages/en.json";
import sq from "../../messages/sq.json";
import { defaultLocale, isLocale, localeCookieName, type Locale } from "./locales";
import { LOCALE_HEADER } from "@/lib/locale-path";

// Static imports, not a `import(`../../messages/${locale}.json`)` template
// dynamic import — the dynamic form resolves through a runtime module cache
// that Turbopack's dev server doesn't reliably invalidate on a messages/*
// edit, serving stale translations (missing-key errors for strings added
// minutes earlier) until the dev server is restarted. Static imports are
// ordinary parts of the module graph and hot-reload like any other edit.
const messagesByLocale: Record<Locale, typeof en> = { en, sq };

export default getRequestConfig(async () => {
  // A URL-prefixed public page (middleware rewrote /en/… and stamped the
  // header) wins over the cookie; everything else is the cookie.
  const headerLocale = (await headers()).get(LOCALE_HEADER) ?? undefined;
  const cookieLocale = (await cookies()).get(localeCookieName)?.value;
  const locale = isLocale(headerLocale) ? headerLocale : isLocale(cookieLocale) ? cookieLocale : defaultLocale;

  return {
    locale,
    messages: messagesByLocale[locale],
  };
});
