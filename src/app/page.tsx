import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 bg-white px-6 text-center text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <h1 className="text-2xl font-medium">SmartDepo</h1>
      <p className="text-neutral-500">Digitize your storage. Find anything in seconds.</p>
      <Link
        href="/builder"
        className="mt-4 rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:border-neutral-400 dark:border-neutral-700 dark:hover:border-neutral-500"
      >
        Open location builder
      </Link>
    </main>
  );
}
