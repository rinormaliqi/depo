import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SignupForm } from "./signup-form";

export default async function SignupPage() {
  const session = await auth();
  if (session?.user) redirect("/builder");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-white px-6 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-center text-xl font-medium">Start your trial</h1>
        <SignupForm />
        <p className="mt-4 text-center text-sm text-neutral-500">
          Already have an account?{" "}
          <Link href="/login" className="underline">
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}
