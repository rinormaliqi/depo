"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useCapabilities } from "@/components/capabilities";

// Shown under the app header for every role while the organization is
// locked (unverified / trial ended / expired / past due / canceled).
// Admins get the way to fix it; everyone else gets told whom to ask —
// otherwise a worker's every action just fails with a toast and nobody
// knows why (#77).
export function LockBanner() {
  const t = useTranslations("lockBanner");
  const caps = useCapabilities();
  if (!caps?.locked) return null;
  const reason = caps.locked;
  const isAdmin = caps.role === "admin";
  const href = reason === "unverified" ? "/verify-email" : "/billing";
  const admins = caps.admins ?? [];

  return (
    <div className="lock-banner" role="status">
      <span className="lock-banner-mark" aria-hidden="true">!</span>
      <span className="lock-banner-text">
        <strong>{t(`title.${reason}`)}</strong>{" "}
        {isAdmin ? t(`admin.${reason}`) : t(`member.${reason}`)}
        {!isAdmin && admins.length > 0 && (
          <>
            {" "}
            {t("askAdmins")}{" "}
            {admins.map((a, i) => (
              <span key={a.email}>
                {i > 0 && ", "}
                <a href={`mailto:${a.email}?subject=SmartDepo`} style={{ color: "inherit", textDecoration: "underline" }}>{a.name}</a>
              </span>
            ))}
            .
          </>
        )}
      </span>
      {isAdmin && (
        <Link href={href} className="btn btn-primary" style={{ flex: "none", fontSize: 12, padding: "4px 10px", marginTop: 0 }}>
          {reason === "unverified" ? t("verifyCta") : t("billingCta")}
        </Link>
      )}
    </div>
  );
}
