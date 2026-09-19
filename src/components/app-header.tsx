"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getBillingSummary } from "@/app/billing/actions";
import { useCapabilities } from "@/components/capabilities";
import { homeFor, primaryNav, secondaryNav } from "@/lib/navigation";
import { logout } from "@/lib/actions/auth";
import { FacilitySwitcher } from "./facility-switcher";
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
  facilityId,
  facilityName,
  floorText,
  userEmail,
}: {
  facilityId?: string;
  facilityName: string;
  floorText: string;
  userEmail: string;
}) {
  const t = useTranslations();
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [billing, setBilling] = useState<BillingSummary | null>(null);
  const [open, setOpen] = useState(false);
  const caps = useCapabilities();
  // Navigation follows capabilities (src/lib/navigation.ts): a worker gets
  // find / scan / labels / map and no management links at all.
  const isWorker = caps?.role === "worker";
  const showBilling = caps?.can.manageBilling ?? false;
  const tabs = (caps ? primaryNav(caps) : []).map((n) => ({ href: n.href, label: t(`nav.${n.key}`) }));
  const secondary = caps ? secondaryNav(caps) : [];
  const home = homeFor(caps?.role ?? "worker");

  // A self-contained fetch rather than a prop every page would need to pass
  // — AppHeader is rendered from ~7 different page types, and this way none
  // of them need to know billing status exists. Only the account owner
  // sees the plan/trial pill; a worker can't act on it.
  // Lets fixed things above the bottom bar (the toaster) make room for it.
  useEffect(() => {
    document.documentElement.style.setProperty("--bottom-nav", "54px");
    return () => {
      document.documentElement.style.removeProperty("--bottom-nav");
    };
  }, []);

  useEffect(() => {
    if (!showBilling) return;
    getBillingSummary().then(setBilling).catch(() => {});
  }, [showBilling]);

  return (
    <div
      className={open ? "app-header is-open" : "app-header"}
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
        href={home}
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
      <div className="app-header-divider" style={{ width: 1, height: 24, background: "var(--color-divider)" }} />
      <div className="app-header-facility" style={{ minWidth: 0 }}>
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
          {facilityId ? <FacilitySwitcher currentId={facilityId} currentName={facilityName} /> : facilityName}
        </div>
        {!isWorker && (
          <div
            className="app-header-floor"
            style={{
              fontSize: 10,
              letterSpacing: ".1em",
              color: "color-mix(in srgb, var(--color-text) 50%, transparent)",
            }}
          >
            {floorText}
          </div>
        )}
      </div>

      {billing && (() => {
        const pill = billingPill(billing, t);
        if (!pill) return null;
        return (
          <Link
            href={pill.href ?? "/billing"}
            className={pill.urgent ? "tag tag-outline app-header-pill" : "tag tag-accent app-header-pill"}
            style={{ whiteSpace: "nowrap", textDecoration: "none" }}
          >
            {pill.text}
          </Link>
        );
      })()}

      <button
        type="button"
        className="btn btn-secondary app-header-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={t("common.menu")}
        style={{ padding: "4px 10px", fontSize: 18, lineHeight: 1 }}
      >
        {open ? "×" : "⋯"}
      </button>

      <div className="seg app-header-tabs" style={{ marginLeft: 8 }}>
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

      <div className="app-header-secondary" style={{ marginLeft: "auto", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
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
        {secondary.map((n) => (
          <Link key={n.href} href={n.href} className="btn btn-secondary">
            {t(`common.${n.key}`)}
          </Link>
        ))}
        <LocaleSwitcher />
        <span
          className="app-header-email"
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

      {/* Phones: the primary tabs live in a bottom bar under the thumb
          (CSS shows it under 768px and hides the in-header tabs). */}
      <nav className="app-nav-bottom" aria-label={t("common.menu")}>
        {tabs.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(tab.href + "/");
          return (
            <Link key={tab.href} href={tab.href} className={active ? "app-nav-bottom-item is-active" : "app-nav-bottom-item"}>
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
