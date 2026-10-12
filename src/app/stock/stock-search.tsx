"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRef, useState } from "react";
import { CustomFieldFilterBar } from "@/components/custom-field-filter";
import type { FieldDefinition } from "@/lib/custom-fields";
import { searchStock } from "./actions";

type Result = Awaited<ReturnType<typeof searchStock>>[number];

// The part of a result that matched what was typed, marked green so the eye
// lands on why this row is here (#215). Case- and accent-insensitive, like
// the search itself reads to a person: "kabllo" marks "Kabllo", "c" marks "ç".
function fold(text: string) {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}
function Highlight({ text, query }: { text: string; query: string }) {
  const q = fold(query.trim());
  if (!q) return <>{text}</>;
  // Positions in the folded string are cut out of the original, which only
  // lines up while folding kept the length — true for ë, ç and the rest of
  // precomposed Latin; anything else just isn't marked.
  const folded = fold(text);
  if (folded.length !== text.length) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let from = 0;
  for (let i = folded.indexOf(q); i >= 0; i = folded.indexOf(q, i + q.length)) {
    if (i > from) parts.push(text.slice(from, i));
    parts.push(<mark key={i} className="search-hit">{text.slice(i, i + q.length)}</mark>);
    from = i + q.length;
  }
  if (from < text.length) parts.push(text.slice(from));
  return <>{parts}</>;
}

export function StockSearch({
  initialQuery,
  initialResults,
  fieldDefs,
}: {
  initialQuery: string;
  initialResults: Result[];
  fieldDefs: FieldDefinition[];
}) {
  const t = useTranslations("stock");
  const [query, setQuery] = useState(initialQuery);
  const [filterFieldId, setFilterFieldId] = useState("");
  const [filterValue, setFilterValue] = useState("");
  const [results, setResults] = useState(initialResults);
  const [loading, setLoading] = useState(false);

  // Every keystroke (or filter change) starts a search and they don't
  // necessarily come back in order, so a slow earlier one could land last
  // and leave the box showing results for a query the person has already
  // moved past — which here means the wrong bin for the thing they are
  // walking to. Only the newest reply is allowed to write.
  const latest = useRef(0);

  async function runSearch(q: string, fieldId: string, value: string) {
    if (!q.trim() && !fieldId) {
      latest.current += 1;
      setResults([]);
      setLoading(false);
      return;
    }
    const seq = (latest.current += 1);
    setLoading(true);
    const r = await searchStock(q, fieldId ? { fieldId, value } : undefined);
    if (seq !== latest.current) return;
    setResults(r);
    setLoading(false);
  }

  function handleQueryChange(value: string) {
    setQuery(value);
    runSearch(value, filterFieldId, filterValue);
  }

  function handleFilterFieldChange(fieldId: string) {
    setFilterFieldId(fieldId);
    runSearch(query, fieldId, "");
  }

  function handleFilterValueChange(value: string) {
    setFilterValue(value);
    runSearch(query, filterFieldId, value);
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
        onChange={(e) => handleQueryChange(e.target.value)}
        autoFocus
      />

      <CustomFieldFilterBar
        fieldDefs={fieldDefs}
        fieldId={filterFieldId}
        value={filterValue}
        onFieldChange={handleFilterFieldChange}
        onValueChange={handleFilterValueChange}
      />

      {loading && (
        <div style={{ fontSize: 12, color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>
          {t("searching")}
        </div>
      )}

      {results.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {results.map((r, i) => (
            // The first result is the one the person most likely wants: it
            // gets the green frame the map uses for a found location.
            <div key={i} className={i === 0 && query.trim() ? "stock-result is-top" : "stock-result"} style={{ border: "1px solid var(--color-divider)" }}>
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
                  <Highlight text={r.itemName} query={query} /> · {r.quantity} {r.unitOfMeasure}
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
                  <span>{r.sku ? <Highlight text={r.sku} query={query} /> : "—"}</span>
                  <span style={{ color: "var(--color-accent-700)" }}><Highlight text={r.path} query={query} /></span>
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

      {(query.trim() || filterFieldId) && !loading && results.length === 0 && (
        <div style={{ fontSize: 12, color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>
          {t("noMatches", { query })}
        </div>
      )}
    </div>
  );
}
