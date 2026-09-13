import Link from "next/link";
import { getMyItems } from "@/app/items/actions";
import { getBinInfo, getBinStock } from "./actions";
import { StockForm } from "./stock-form";

export default async function BinPage({
  params,
}: {
  params: Promise<{ locationId: string }>;
}) {
  const { locationId } = await params;
  const bin = await getBinInfo(locationId);
  const stockRows = await getBinStock(locationId);
  const myItems = await getMyItems();

  return (
    <main className="min-h-screen bg-white px-4 py-8 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-medium">{bin.name}</h1>
          <Link
            href="/builder"
            className="text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
          >
            ‹ Back to builder
          </Link>
        </div>

        <ul className="mb-6 flex flex-col gap-1">
          {stockRows.map((row) => (
            <li
              key={row.itemId}
              className="flex justify-between border-b border-neutral-200 py-2 text-sm dark:border-neutral-800"
            >
              <span>{row.name}</span>
              <span className="text-neutral-500">
                {row.quantity} {row.unitOfMeasure}
              </span>
            </li>
          ))}
        </ul>
        {stockRows.length === 0 && (
          <p className="mb-6 text-sm text-neutral-400">Nothing stored here yet.</p>
        )}

        {myItems.length === 0 ? (
          <p className="text-sm text-neutral-400">
            No items in your catalog yet —{" "}
            <Link href="/items" className="underline">
              add one
            </Link>{" "}
            first.
          </p>
        ) : (
          <StockForm locationId={locationId} items={myItems} />
        )}
      </div>
    </main>
  );
}
