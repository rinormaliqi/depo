"use client";

import { useActionState } from "react";
import { signUp } from "./actions";

export function SignupForm() {
  const [state, formAction, isPending] = useActionState(signUp, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input
        name="companyName"
        placeholder="Company name"
        required
        className="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
      />
      <input
        name="name"
        placeholder="Your name"
        required
        className="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
      />
      <input
        name="email"
        type="email"
        placeholder="Email"
        required
        className="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
      />
      <input
        name="password"
        type="password"
        placeholder="Password (min. 8 characters)"
        required
        minLength={8}
        className="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
      />
      {state?.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
      >
        {isPending ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}
