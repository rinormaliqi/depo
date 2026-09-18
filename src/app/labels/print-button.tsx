"use client";

import { useTranslations } from "next-intl";

export function PrintButton() {
  const t = useTranslations("labels");
  return (
    <button type="button" className="btn btn-primary" onClick={() => window.print()}>
      {t("print")}
    </button>
  );
}
