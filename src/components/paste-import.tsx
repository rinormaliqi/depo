"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { useNotify } from "@/components/notifications";
import { unwrap, type ActionResult } from "@/lib/action-result";

// Paste (or open a file into the box) → Check → Import, shared by the
// items and stock imports. The preview is pinned to the exact text it
// was computed for: editing the box after a check hides the import
// button until the next check, so the numbers on screen are always the
// numbers that will be written. Copy lives under the `ns` namespace
// (items.import / stock.import): summary, done, error.<code>, field.<name>.

export type PastePreview = {
  counts: Record<string, number>;
  errors: { line: number; code: string; field?: string; value?: string }[];
  sample: string[][];
  hasHeader: boolean;
};

type Props = {
  ns: "items.import" | "stock.import";
  columns: readonly string[];
  templateHref: string;
  backHref: string;
  preview: (text: string) => Promise<ActionResult<PastePreview>>;
  commit: (text: string) => Promise<ActionResult<Record<string, number>>>;
};

export function PasteImport({ ns, columns, templateHref, backHref, preview: rawPreview, commit: rawCommit }: Props) {
  const t = useTranslations(ns);
  const notify = useNotify();
  const router = useRouter();
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<{ text: string; result: PastePreview } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isCommitting, startCommit] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  const current = preview && preview.text === text ? preview.result : null;
  const stale = preview !== null && current === null;

  function openFile(file: File | undefined) {
    if (!file) return;
    file
      .text()
      .then((content) => setText(content))
      .catch(() => notify.error(t("errorFileRead")));
  }

  function check() {
    const snapshot = text;
    startTransition(async () => {
      const result = await notify.run(() => unwrap(rawPreview)(snapshot));
      if (result) setPreview({ text: snapshot, result });
    });
  }

  function commit() {
    if (!current) return;
    const snapshot = text;
    startCommit(async () => {
      const done = await notify.run(() => unwrap(rawCommit)(snapshot));
      if (!done) return;
      notify.success(t("done", done));
      router.push(backHref);
    });
  }

  const total = current ? Object.values(current.counts).reduce((a, b) => a + b, 0) : 0;
  const canCommit = current !== null && current.errors.length === 0 && current.sample.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <button type="button" className="btn btn-secondary" onClick={() => fileInput.current?.click()}>
          {t("chooseFile")}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".csv,.txt,.tsv,text/csv,text/plain,text/tab-separated-values"
          hidden
          onChange={(e) => {
            openFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <a className="btn btn-ghost" href={templateHref} download>
          {t("template")}
        </a>
        <span style={{ flex: 1 }} />
        <Link href={backHref} className="btn btn-ghost">
          {t("back")}
        </Link>
      </div>

      <textarea
        className="input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t("placeholder")}
        spellCheck={false}
        style={{ minHeight: 220, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12, whiteSpace: "pre", overflow: "auto" }}
      />

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <button type="button" className="btn btn-secondary" onClick={check} disabled={isPending || isCommitting || text.trim() === ""}>
          {isPending ? t("previewing") : t("preview")}
        </button>
        {canCommit && (
          <button type="button" className="btn btn-primary" onClick={commit} disabled={isCommitting}>
            {isCommitting ? t("committing") : t("commit", { ...current.counts, total })}
          </button>
        )}
        {stale && (
          <span className="text-muted" style={{ fontSize: 12 }}>
            {t("changedSincePreview")}
          </span>
        )}
      </div>

      {current && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, fontSize: 13 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", alignItems: "baseline" }}>
            <strong>{t("summary", { ...current.counts, errors: current.errors.length })}</strong>
            <span className="text-muted" style={{ fontSize: 12 }}>
              {current.hasHeader ? t("headerDetected") : t("noHeader")}
            </span>
          </div>

          {current.errors.length > 0 && (
            <div style={{ border: "1px solid var(--color-danger-500)", background: "var(--color-danger-100)", padding: "10px 12px" }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>{t("errorsTitle")}</div>
              <ul style={{ margin: 0, paddingLeft: 18, maxHeight: 220, overflow: "auto" }}>
                {current.errors.map((e, i) => (
                  <li key={i}>
                    <span className="text-muted">{t("line", { line: e.line })}</span> —{" "}
                    {t(`error.${e.code}`, { field: e.field ? t(`field.${e.field}`) : "", value: e.value ?? "" })}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {current.sample.length > 0 && (
            <div>
              <div className="text-muted" style={{ fontSize: 12, marginBottom: 4 }}>{t("sampleTitle")}</div>
              <div style={{ overflowX: "auto" }}>
                <table className="table">
                  <thead>
                    <tr>
                      {columns.map((c) => (
                        <th key={c}>{t(`field.${c}`)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {current.sample.map((cells, i) => (
                      <tr key={i}>
                        {cells.map((cell, j) => (
                          <td key={j}>{cell || "—"}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
