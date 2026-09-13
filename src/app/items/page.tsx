import Link from "next/link";
import { getMyItems } from "./actions";
import { ItemForm } from "./item-form";

export default async function ItemsPage() {
  const myItems = await getMyItems();

  return (
    <main className="min-h-screen bg-white px-4 py-8 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-medium">Items</h1>
          <Link
            href="/builder"
            className="text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
          >
            ‹ Back to builder
          </Link>
        </div>

        <ItemForm />

        <ul className="mt-6 flex flex-col gap-1">
          {myItems.map((item) => (
            <li
              key={item.id}
              className="flex justify-between border-b border-neutral-200 py-2 text-sm dark:border-neutral-800"
            >
              <span>{item.name}</span>
              <span className="text-neutral-500">
                {item.unitOfMeasure}
                {item.category ? ` · ${item.category}` : ""}
              </span>
            </li>
          ))}
        </ul>

        {myItems.length === 0 && (
          <p className="mt-6 text-center text-sm text-neutral-400">No items yet.</p>
        )}
      </div>
    </main>
  );
}
