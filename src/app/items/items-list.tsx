"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useConfirm, useNotify } from "@/components/notifications";
import { unwrap } from "@/lib/action-result";
import * as rawActions from "./actions";
import type { ItemPatch, ItemWithStock } from "./actions";
import { MAX_FIELD_CHARS } from "@/lib/import-table";

const updateItem = unwrap(rawActions.updateItem);
const deleteItem = unwrap(rawActions.deleteItem);

// The catalogue as rows that open into a one-line form: a typo is fixed
// where it's seen, and an item that never got used can be removed. The
// server says no when it can't (stock on the floor, movements in the
// history) — the button stays, the toast explains.
export function ItemsList({ items, canManage }: { items: ItemWithStock[]; canManage: boolean }) {
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div style={{ marginTop: 20, display: "flex", flexDirection: "column" }}>
      {items.map((item) =>
        editing === item.id ? (
          <ItemEditor key={item.id} item={item} onDone={() => setEditing(null)} />
        ) : (
          <ItemRow key={item.id} item={item} canManage={canManage} onEdit={() => setEditing(item.id)} />
        ),
      )}
    </div>
  );
}

function ItemRow({ item, canManage, onEdit }: { item: ItemWithStock; canManage: boolean; onEdit: () => void }) {
  const t = useTranslations("items");
  const notify = useNotify();
  const confirm = useConfirm();
  const [isPending, startTransition] = useTransition();

  async function remove() {
    const ok = await confirm({ title: t("deleteTitle", { name: item.name }), body: t("deleteBody"), confirmLabel: t("delete"), danger: true });
    if (!ok) return;
    startTransition(async () => {
      await notify.run(() => deleteItem(item.id), { success: t("deleted", { name: item.name }) });
    });
  }

  return (
    <div
      style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "2px 12px", padding: "8px 0", borderBottom: "1px solid var(--color-divider)", fontSize: 13 }}
    >
      <span style={{ flex: "1 1 200px" }}>
        {item.name}
        {item.sku && (
          <span className="text-muted" style={{ marginLeft: 8, fontSize: 12 }}>
            {item.sku}
          </span>
        )}
      </span>
      <span className="text-muted" style={{ fontSize: 12 }}>
        {item.unitOfMeasure}
        {item.category ? ` · ${item.category}` : ""}
        {item.inStock > 0 ? ` · ${t("stockNote", { count: item.inStock })}` : ""}
      </span>
      {canManage && (
        <span style={{ display: "flex", gap: 4 }}>
          <button type="button" className="btn btn-ghost" onClick={onEdit} style={{ fontSize: 11 }}>
            {t("edit")}
          </button>
          <button type="button" className="btn btn-ghost" onClick={remove} disabled={isPending} style={{ fontSize: 11, color: "var(--color-danger-500)" }}>
            {t("delete")}
          </button>
        </span>
      )}
    </div>
  );
}

function ItemEditor({ item, onDone }: { item: ItemWithStock; onDone: () => void }) {
  const t = useTranslations("items");
  const notify = useNotify();
  const [isPending, startTransition] = useTransition();
  const [patch, setPatch] = useState<ItemPatch>({ name: item.name, unitOfMeasure: item.unitOfMeasure, sku: item.sku ?? "", category: item.category ?? "" });
  const set = (key: keyof ItemPatch) => (e: React.ChangeEvent<HTMLInputElement>) => setPatch((p) => ({ ...p, [key]: e.target.value }));

  function save() {
    startTransition(async () => {
      const done = await notify.run(() => updateItem(item.id, patch), { success: t("updated", { name: patch.name.trim() }) });
      if (done) onDone();
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--color-divider)" }}
    >
      <input className="input" value={patch.name} onChange={set("name")} maxLength={MAX_FIELD_CHARS} placeholder={t("namePlaceholder")} required autoFocus style={{ width: 160 }} />
      <input className="input" value={patch.unitOfMeasure} onChange={set("unitOfMeasure")} maxLength={MAX_FIELD_CHARS} placeholder={t("unitPlaceholder")} required style={{ width: 120 }} />
      <input className="input" value={patch.sku} onChange={set("sku")} maxLength={MAX_FIELD_CHARS} placeholder={t("skuPlaceholder")} style={{ width: 120 }} />
      <input className="input" value={patch.category} onChange={set("category")} maxLength={MAX_FIELD_CHARS} placeholder={t("categoryPlaceholder")} style={{ width: 140 }} />
      <button type="submit" className="btn btn-primary" disabled={isPending}>
        {isPending ? t("saving") : t("save")}
      </button>
      <button type="button" className="btn btn-ghost" onClick={onDone} disabled={isPending}>
        {t("cancel")}
      </button>
    </form>
  );
}
