"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { pickStock, receiveStock } from "./actions";

type Item = { id: string; name: string; unitOfMeasure: string };

export function StockForm({ locationId, items }: { locationId: string; items: Item[] }) {
  const t = useTranslations();
  const router = useRouter();
  const [itemId, setItemId] = useState(items[0]?.id ?? "");
  const [quantity, setQuantity] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handle(action: typeof receiveStock | typeof pickStock) {
    setError(null);
    const qty = Number(quantity);
    if (!itemId || !Number.isInteger(qty) || qty <= 0) {
      setError(t("bin.errorPickItem"));
      return;
    }
    setIsPending(true);
    try {
      await action(locationId, itemId, qty);
      setQuantity("1");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.errorGeneric"));
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <select className="input" value={itemId} onChange={(e) => setItemId(e.target.value)} style={{ flex: 1, minWidth: 160 }}>
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} ({item.unitOfMeasure})
            </option>
          ))}
        </select>
        <input
          className="input"
          type="number"
          min={1}
          step={1}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          style={{ width: 80 }}
        />
        <button className="btn btn-primary" onClick={() => handle(receiveStock)} disabled={isPending}>
          {t("bin.add")}
        </button>
        <button className="btn btn-secondary" onClick={() => handle(pickStock)} disabled={isPending}>
          {t("bin.remove")}
        </button>
      </div>
      {error && <p style={{ fontSize: 13, color: "var(--color-accent-800)" }}>{error}</p>}
    </div>
  );
}
