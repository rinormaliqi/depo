"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import * as rawActions from "./actions";
import { unwrap } from "@/lib/action-result";
import { useNotify } from "@/components/notifications";
import { MAX_MOVEMENT_QUANTITY } from "@/lib/stock-limits";

const receiveStock = unwrap(rawActions.receiveStock);
const moveStock = unwrap(rawActions.moveStock);
const exitStock = unwrap(rawActions.exitStock);

type Item = { id: string; name: string; unitOfMeasure: string };
type Action = "receive" | "move" | "sale" | "remove";
const ACTIONS: Action[] = ["receive", "move", "sale", "remove"];

export function StockForm({ locationId, items, otherBinCodes }: { locationId: string; items: Item[]; otherBinCodes: string[] }) {
  const t = useTranslations();
  const router = useRouter();
  const [action, setAction] = useState<Action>("receive");
  const [itemId, setItemId] = useState(items[0]?.id ?? "");
  const [quantity, setQuantity] = useState("1");
  const [destCode, setDestCode] = useState("");
  const notify = useNotify();
  const [isPending, setIsPending] = useState(false);

  async function handleCommit() {
    const qty = Number(quantity);
    if (!itemId || !Number.isInteger(qty) || qty <= 0) {
      notify.warning(t("bin.errorPickItem"));
      return;
    }
    if (action === "move" && !destCode.trim()) {
      notify.warning(t("scanner.errorEnterDestination"));
      return;
    }
    const item = items.find((i) => i.id === itemId);
    const successKey = { receive: "bin.added", move: "bin.moved", sale: "bin.sold", remove: "bin.removed" }[action] as
      | "bin.added"
      | "bin.moved"
      | "bin.sold"
      | "bin.removed";
    setIsPending(true);
    // notify.run resolves to the callback's return value on success or
    // `undefined` on a caught failure — receive/move/exit all resolve void,
    // which is undefined too, so a plain `=== undefined` check couldn't
    // tell success from failure. Returning `true` gives it something to
    // actually distinguish.
    const done = await notify.run(
      async (): Promise<true> => {
        if (action === "receive") await receiveStock(locationId, itemId, qty);
        else if (action === "move") await moveStock(locationId, itemId, qty, destCode);
        else await exitStock(locationId, itemId, qty, action);
        return true;
      },
      {
        success: t(successKey, { qty, unit: item?.unitOfMeasure ?? "", name: item?.name ?? "", code: destCode.trim().toUpperCase() }),
      },
    );
    setIsPending(false);
    if (!done) return;
    setQuantity("1");
    setDestCode("");
    router.refresh();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="bin-form">
        {ACTIONS.map((a) => (
          <button
            key={a}
            type="button"
            className={a === action ? "btn btn-primary" : "btn btn-secondary"}
            onClick={() => setAction(a)}
            disabled={isPending}
            style={{ flex: "1 1 auto" }}
          >
            {t(`scanner.action${a.charAt(0).toUpperCase()}${a.slice(1)}` as "scanner.actionReceive")}
          </button>
        ))}
      </div>
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
        {action === "move" && (
          <>
            <input
              className="input bin-form-item"
              list="other-bin-codes"
              type="text"
              autoCapitalize="characters"
              autoCorrect="off"
              placeholder={t("scanner.destination")}
              value={destCode}
              onChange={(e) => setDestCode(e.target.value)}
            />
            <datalist id="other-bin-codes">
              {otherBinCodes.map((code) => (
                <option key={code} value={code} />
              ))}
            </datalist>
          </>
        )}
        <button className="btn btn-primary" onClick={handleCommit} disabled={isPending}>
          {t(`scanner.commit${action.charAt(0).toUpperCase()}${action.slice(1)}` as "scanner.commitReceive")}
        </button>
      </div>
    </div>
  );
}
