import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/builder");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-white px-6 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-center text-xl font-medium">Log in</h1>
        <LoginForm />
        <p className="mt-4 text-center text-sm text-neutral-500">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="underline">
            Sign up
          </Link>
        </p>
      </div>
    </main>
  );
}
