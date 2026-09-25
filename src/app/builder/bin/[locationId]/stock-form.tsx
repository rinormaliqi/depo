"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import * as rawActions from "./actions";
import { unwrap } from "@/lib/action-result";
import { useNotify } from "@/components/notifications";
import { MAX_MOVEMENT_QUANTITY } from "@/lib/stock-limits";

const receiveStock = unwrap(rawActions.receiveStock);
const pickStock = unwrap(rawActions.pickStock);

type Item = { id: string; name: string; unitOfMeasure: string };

export function StockForm({ locationId, items }: { locationId: string; items: Item[] }) {
  const t = useTranslations();
  const router = useRouter();
  const [itemId, setItemId] = useState(items[0]?.id ?? "");
  const [quantity, setQuantity] = useState("1");
  const notify = useNotify();
  const [isPending, setIsPending] = useState(false);

  async function handle(action: typeof receiveStock | typeof pickStock) {
    const qty = Number(quantity);
    if (!itemId || !Number.isInteger(qty) || qty <= 0) {
      notify.warning(t("bin.errorPickItem"));
      return;
    }
    const item = items.find((i) => i.id === itemId);
    setIsPending(true);
    const done = await notify.run(() => action(locationId, itemId, qty), {
      success: t(action === receiveStock ? "bin.added" : "bin.removed", { qty, unit: item?.unitOfMeasure ?? "", name: item?.name ?? "" }),
    });
    setIsPending(false);
    if (done === undefined) return;
    setQuantity("1");
    router.refresh();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="bin-form">
        <select className="input bin-form-item" value={itemId} onChange={(e) => setItemId(e.target.value)}>
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} ({item.unitOfMeasure})
            </option>
          ))}
        </select>
        <input
          className="input bin-form-qty"
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_MOVEMENT_QUANTITY}
          step={1}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
        <button className="btn btn-primary" onClick={() => handle(receiveStock)} disabled={isPending}>
          {t("bin.add")}
        </button>
        <button className="btn btn-secondary" onClick={() => handle(pickStock)} disabled={isPending}>
          {t("bin.remove")}
        </button>
      </div>
    </div>
  );
}
