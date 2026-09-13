"use client";

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
        Locate
      </div>
      <input
        className="input"
        type="search"
        placeholder="SKU, name or location"
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        autoFocus
      />

      {results.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {results.map((r, i) => (
            <Link
              key={i}
              href={`/builder/bin/${r.locationId}`}
              style={{
                display: "block",
                padding: "7px 8px",
                border: "1px solid var(--color-divider)",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div style={{ fontSize: 12, lineHeight: 1.25 }}>
                {r.itemName} · {r.quantity} {r.unitOfMeasure}
              </div>
              <div
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
          ))}
        </div>
      )}

      {query.trim() && !loading && results.length === 0 && (
        <div style={{ fontSize: 12, color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>
          Nothing matches &ldquo;{query}&rdquo;.
        </div>
      )}
    </div>
  );
}
