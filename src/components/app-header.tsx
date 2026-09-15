"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getBillingSummary } from "@/app/billing/actions";
import { logout } from "@/lib/actions/auth";
import { LocaleSwitcher } from "./locale-switcher";

type BillingSummary = Awaited<ReturnType<typeof getBillingSummary>>;

function billingPill(billing: BillingSummary, t: ReturnType<typeof useTranslations>): { text: string; urgent: boolean; href?: string } | null {
  if (!billing.planName) return null;
  if (billing.subscriptionStatus === "trialing") {
    // No trial end yet = founder hasn't verified their email; the clock
    // starts when they do (see markEmailVerified in src/lib/email-verification.ts).
    if (!billing.trialEndsAt) return { text: t("common.verifyEmail"), urgent: true, href: "/verify-email" };
    const daysLeft = billing.trialEndsAt
      ? Math.ceil((new Date(billing.trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : null;
    if (daysLeft !== null && daysLeft <= 0) return { text: t("common.trialEnded"), urgent: true };
    return { text: t("common.trialDaysLeft", { plan: billing.planName, n: daysLeft ?? "?" }), urgent: (daysLeft ?? 99) <= 5 };
  }
  if (billing.subscriptionStatus === "active" && billing.paidUntil) {
    const daysLeft = Math.ceil((new Date(billing.paidUntil).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysLeft <= 0) return { text: t("common.planExpired", { plan: billing.planName }), urgent: true };
    if (daysLeft <= 7) return { text: t("common.planRenewSoon", { plan: billing.planName, n: daysLeft }), urgent: true };
  }
  if (billing.subscriptionStatus === "past_due") return { text: t("common.planPastDue", { plan: billing.planName }), urgent: true };
  if (billing.subscriptionStatus === "canceled") return { text: t("common.planCanceled", { plan: billing.planName }), urgent: true };
  return { text: billing.planName, urgent: false };
}

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
  const [billing, setBilling] = useState<BillingSummary | null>(null);

  // A self-contained fetch rather than a prop every page would need to pass
  // — AppHeader is rendered from ~7 different page types, and this way none
  // of them need to know billing status exists.
  useEffect(() => {
    getBillingSummary().then(setBilling).catch(() => {});
  }, []);

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

      {billing && (() => {
        const pill = billingPill(billing, t);
        if (!pill) return null;
        return (
          <Link
            href={pill.href ?? "/billing"}
            className={pill.urgent ? "tag tag-outline" : "tag tag-accent"}
            style={{ whiteSpace: "nowrap", textDecoration: "none" }}
          >
            {pill.text}
          </Link>
        );
      })()}

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
        <Link href="/billing" className="btn btn-secondary">
          {t("common.billing")}
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
