import Link from "next/link";
import { auth, signOut } from "@/auth";

export default async function Home() {
  const session = await auth();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 bg-white px-6 text-center text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <h1 className="text-2xl font-medium">SmartDepo</h1>
      <p className="text-neutral-500">Digitize your storage. Find anything in seconds.</p>

      {session?.user ? (
        <div className="mt-4 flex flex-col items-center gap-2">
          <Link
            href="/builder"
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:border-neutral-400 dark:border-neutral-700 dark:hover:border-neutral-500"
          >
            Open location builder
          </Link>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button
              type="submit"
              className="text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
            >
              Sign out ({session.user.email})
            </button>
          </form>
        </div>
      ) : (
        <div className="mt-4 flex gap-2">
          <Link
            href="/login"
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:border-neutral-400 dark:border-neutral-700 dark:hover:border-neutral-500"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
          >
            Sign up
          </Link>
        </div>
      )}
    </main>
  );
}
