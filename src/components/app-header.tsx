"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { logout } from "@/lib/actions/auth";
import { LocaleSwitcher } from "./locale-switcher";

export function AppHeader({
  facilityName,
  floorText,
  userEmail,
}: {
  facilityName: string;
  floorText: string;
  userEmail: string;
}) {
  const t = useTranslations();
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState("");

  const tabs = [
    { href: "/builder", label: t("nav.blueprint") },
    { href: "/stock", label: t("nav.stock") },
    { href: "/metrics", label: t("nav.metrics") },
    { href: "/scanner", label: t("nav.scanner") },
  ];

  return (
    <div
      style={{
        flex: "none",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 14,
        rowGap: 8,
        padding: "9px 14px",
        background: "#fff",
        borderBottom: "1px solid var(--color-divider)",
      }}
    >
      <Link
        href="/builder"
        style={{
          fontFamily: "var(--font-heading)",
          fontWeight: 700,
          fontSize: 19,
          letterSpacing: ".06em",
          whiteSpace: "nowrap",
          color: "var(--color-text)",
        }}
      >
        SMART<span style={{ color: "var(--color-accent)" }}>/</span>DEPO
      </Link>
      <div style={{ width: 1, height: 24, background: "var(--color-divider)" }} />
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontFamily: "var(--font-heading)",
            fontSize: 15,
            letterSpacing: ".04em",
            lineHeight: 1.1,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {facilityName}
        </div>
        <div
          style={{
            fontSize: 10,
            letterSpacing: ".1em",
            color: "color-mix(in srgb, var(--color-text) 50%, transparent)",
          }}
        >
          {floorText}
        </div>
      </div>

      <div className="seg" style={{ marginLeft: 8 }}>
        {tabs.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(tab.href + "/");
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="seg-opt"
              style={{
                fontFamily: "var(--font-heading)",
                letterSpacing: ".1em",
                textTransform: "uppercase",
                background: active ? "var(--color-accent)" : undefined,
                color: active ? "var(--color-bg)" : undefined,
              }}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      <div style={{ marginLeft: "auto", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <input
          className="input"
          type="search"
          placeholder={t("common.searchPlaceholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && query.trim()) {
              router.push(`/stock?q=${encodeURIComponent(query.trim())}`);
            }
          }}
          style={{ flex: "1 1 160px", minWidth: 120, maxWidth: 250 }}
        />
        <Link href="/items" className="btn btn-secondary">
          {t("common.items")}
        </Link>
        <Link href="/team" className="btn btn-secondary">
          {t("common.team")}
        </Link>
        <LocaleSwitcher />
        <span
          style={{
            fontSize: 11,
            color: "color-mix(in srgb, var(--color-text) 50%, transparent)",
            whiteSpace: "nowrap",
          }}
        >
          {userEmail}
        </span>
        <button className="btn btn-ghost" onClick={() => logout()}>
          {t("common.signOut")}
        </button>
      </div>
    </div>
  );
}
