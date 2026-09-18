"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import type { Locale } from "@/i18n/locales";
import { LOCALIZED_PUBLIC_PATHS, localizedPath, splitLocale } from "@/lib/locale-path";
import { setLocale } from "@/lib/actions/locale";

export function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  // On a public page the language is part of the URL, so switching means
  // going to the sibling address (/pricing ↔ /en/pricing); the cookie is
  // set too so the app behind the login follows. Elsewhere it's cookie +
  // refresh, as before.
  function switchTo(next: Locale) {
    if (next === locale || isPending) return;
    startTransition(async () => {
      await setLocale(next);
      const { path } = splitLocale(pathname);
      if (LOCALIZED_PUBLIC_PATHS.has(path)) router.push(localizedPath(next, path));
      else router.refresh();
    });
  }

  return (
    <div className="seg" style={{ fontSize: 11 }}>
      {(["sq", "en"] as const).map((l) => (
        <button
          key={l}
          onClick={() => switchTo(l)}
          className="seg-opt"
          style={{
            fontFamily: "var(--font-heading)",
            letterSpacing: ".06em",
            background: locale === l ? "var(--color-accent)" : undefined,
            color: locale === l ? "var(--color-bg)" : undefined,
          }}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
