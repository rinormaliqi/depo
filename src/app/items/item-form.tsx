"use client";

import { useActionState } from "react";
import { createItem } from "./actions";

export function ItemForm() {
  const [state, formAction, isPending] = useActionState(createItem, undefined);

  return (
    <form action={formAction} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
      <input className="input" name="name" placeholder="Name" required style={{ width: 160 }} />
      <input className="input" name="unitOfMeasure" placeholder="Unit (pcs, kg, bags…)" required style={{ width: 160 }} />
      <input className="input" name="sku" placeholder="SKU (optional)" style={{ width: 140 }} />
      <input className="input" name="category" placeholder="Category (optional)" style={{ width: 160 }} />
      {state?.error && <p style={{ width: "100%", fontSize: 13, color: "var(--color-accent-800)" }}>{state.error}</p>}
      <button type="submit" className="btn btn-primary" disabled={isPending}>
        {isPending ? "Adding…" : "Add item"}
      </button>
    </form>
  );
}
