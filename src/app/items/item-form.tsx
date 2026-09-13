"use client";

import { useActionState } from "react";
import { createItem } from "./actions";

export function ItemForm() {
  const [state, formAction, isPending] = useActionState(createItem, undefined);

  return (
    <form action={formAction} className="flex flex-wrap gap-2">
      <input
        name="name"
        placeholder="Name"
        required
        className="rounded border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
      />
      <input
        name="unitOfMeasure"
        placeholder="Unit (pcs, kg, bags…)"
        required
        className="rounded border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
      />
      <input
        name="sku"
        placeholder="SKU (optional)"
        className="rounded border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
      />
      <input
        name="category"
        placeholder="Category (optional)"
        className="rounded border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
      />
      {state?.error && <p className="w-full text-sm text-red-600 dark:text-red-400">{state.error}</p>}
      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-neutral-900 px-3 py-1 text-sm text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
      >
        {isPending ? "Adding…" : "Add item"}
      </button>
    </form>
  );
}
