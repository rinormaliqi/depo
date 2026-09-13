"use client";

import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { Locale } from "@/i18n/locales";
import { setLocale } from "@/lib/actions/locale";

export function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function switchTo(next: Locale) {
    if (next === locale || isPending) return;
    startTransition(async () => {
      await setLocale(next);
      router.refresh();
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
