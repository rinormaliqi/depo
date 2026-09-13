"use client";

import { useActionState } from "react";
import { login } from "./actions";

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(login, undefined);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="field">
        <label>Email</label>
        <input className="input" name="email" type="email" placeholder="you@company.com" required />
      </div>
      <div className="field">
        <label>Password</label>
        <input className="input" name="password" type="password" placeholder="••••••••" required />
      </div>
      {state?.error && <p style={{ fontSize: 13, color: "var(--color-accent-800)" }}>{state.error}</p>}
      <button type="submit" className="btn btn-primary btn-block" disabled={isPending}>
        {isPending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
