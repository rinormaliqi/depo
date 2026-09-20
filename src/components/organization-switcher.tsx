"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { getMyOrganizations, switchOrganization } from "@/lib/actions/organization";

// Appears in the header only for people who belong to more than one
// company — most users never see it. Switching moves the whole app
// (facility, capabilities, nav) to that organization and lands on /start
// so the role there decides the first page.
export function OrganizationSwitcher({ currentId }: { currentId: string }) {
  const t = useTranslations("organization");
  const router = useRouter();
  const [all, setAll] = useState<{ id: string; name: string; role: string }[] | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    getMyOrganizations().then(setAll).catch(() => {});
  }, [currentId]);

  if (!all || all.length <= 1) return null;

  return (
    <select
      className="input org-switcher"
      value={currentId}
      disabled={pending}
      aria-label={t("switch")}
      onChange={(e) => {
        const id = e.target.value;
        if (id === currentId) return;
        startTransition(async () => {
          await switchOrganization(id);
          router.push("/start");
          router.refresh();
        });
      }}
      style={{ fontSize: 12, padding: "3px 6px", maxWidth: 180 }}
    >
      {all.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name} · {t(`role.${o.role}`)}
        </option>
      ))}
    </select>
  );
}
