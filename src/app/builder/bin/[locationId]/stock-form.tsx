"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { pickStock, receiveStock } from "./actions";

type Item = { id: string; name: string; unitOfMeasure: string };

export function StockForm({ locationId, items }: { locationId: string; items: Item[] }) {
  const router = useRouter();
  const [itemId, setItemId] = useState(items[0]?.id ?? "");
  const [quantity, setQuantity] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handle(action: typeof receiveStock | typeof pickStock) {
    setError(null);
    const qty = Number(quantity);
    if (!itemId || !Number.isInteger(qty) || qty <= 0) {
      setError("Pick an item and a positive whole quantity");
      return;
    }
    setIsPending(true);
    try {
      await action(locationId, itemId, qty);
      setQuantity("1");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <select
          value={itemId}
          onChange={(e) => setItemId(e.target.value)}
          className="rounded border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        >
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} ({item.unitOfMeasure})
            </option>
          ))}
        </select>
        <input
          type="number"
          min={1}
          step={1}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="w-20 rounded border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
        <button
          onClick={() => handle(receiveStock)}
          disabled={isPending}
          className="rounded bg-neutral-900 px-3 py-1 text-sm text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
        >
          Add
        </button>
        <button
          onClick={() => handle(pickStock)}
          disabled={isPending}
          className="rounded border border-neutral-300 px-3 py-1 text-sm disabled:opacity-50 dark:border-neutral-700"
        >
          Remove
        </button>
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
