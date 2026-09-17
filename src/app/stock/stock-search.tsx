"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { searchStock } from "./actions";

type Result = Awaited<ReturnType<typeof searchStock>>[number];

export function StockSearch({
  initialQuery,
  initialResults,
}: {
  initialQuery: string;
  initialResults: Result[];
}) {
  const t = useTranslations("stock");
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState(initialResults);
  const [loading, setLoading] = useState(false);

  async function handleChange(value: string) {
    setQuery(value);
    if (!value.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    const r = await searchStock(value);
    setResults(r);
    setLoading(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      <div
        style={{
          fontFamily: "var(--font-heading)",
          fontSize: 11,
          letterSpacing: ".16em",
          textTransform: "uppercase",
          color: "color-mix(in srgb, var(--color-text) 55%, transparent)",
        }}
      >
        {t("locate")}
      </div>
      <input
        className="input"
        type="search"
        placeholder={t("searchPlaceholder")}
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        autoFocus
      />

      {results.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {results.map((r, i) => (
            <div key={i} style={{ border: "1px solid var(--color-divider)" }}>
              <Link
                href={`/builder?bin=${r.locationId}`}
                className="stock-result-primary"
                style={{
                  display: "block",
                  padding: "7px 8px",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <div className="stock-result-main" style={{ fontSize: 12, lineHeight: 1.25 }}>
                  {r.itemName} · {r.quantity} {r.unitOfMeasure}
                </div>
                <div
                  className="stock-result-meta"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 6,
                    marginTop: 3,
                    fontSize: 10,
                    fontVariantNumeric: "tabular-nums",
                    color: "color-mix(in srgb, var(--color-text) 55%, transparent)",
                  }}
                >
                  <span>{r.sku ?? "—"}</span>
                  <span style={{ color: "var(--color-accent-700)" }}>{r.path}</span>
                </div>
              </Link>
              <Link
                href={`/builder/bin/${r.locationId}`}
                className="stock-result-link"
                style={{
                  display: "block",
                  padding: "4px 8px 6px",
                  fontSize: 10,
                  textAlign: "right",
                  color: "var(--color-accent)",
                  textDecoration: "none",
                  borderTop: "1px solid color-mix(in srgb, var(--color-text) 6%, transparent)",
                }}
              >
                {t("manageStock")} ›
              </Link>
            </div>
          ))}
        </div>
      )}

      {query.trim() && !loading && results.length === 0 && (
        <div style={{ fontSize: 12, color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>
          {t("noMatches", { query })}
        </div>
      )}
    </div>
  );
}
