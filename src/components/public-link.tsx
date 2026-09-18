"use client";

import { useLocale } from "next-intl";
import Link from "next/link";
import type { ComponentProps } from "react";
import type { Locale } from "@/i18n/locales";
import { LOCALIZED_PUBLIC_PATHS, localizedPath } from "@/lib/locale-path";

// next/link for the public pages: keeps the visitor in their language by
// prefixing the href (/pricing → /en/pricing when the page is English).
// Paths that aren't language-versioned (the app, mailto:) pass through.
export function PublicLink({ href, ...rest }: ComponentProps<typeof Link> & { href: string }) {
  const locale = useLocale() as Locale;
  const [path, suffix] = splitSuffix(href);
  const target = LOCALIZED_PUBLIC_PATHS.has(path) ? localizedPath(locale, path) + suffix : href;
  return <Link href={target} {...rest} />;
}

function splitSuffix(href: string): [string, string] {
  const i = href.search(/[?#]/);
  return i === -1 ? [href, ""] : [href.slice(0, i), href.slice(i)];
}
