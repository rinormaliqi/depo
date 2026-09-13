"use client";

import { useActionState } from "react";
import { signUp } from "./actions";

export function SignupForm() {
  const [state, formAction, isPending] = useActionState(signUp, undefined);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="field">
        <label>Company name</label>
        <input className="input" name="companyName" placeholder="Acme Yard" required />
      </div>
      <div className="field">
        <label>Your name</label>
        <input className="input" name="name" placeholder="Jane Smith" required />
      </div>
      <div className="field">
        <label>Email</label>
        <input className="input" name="email" type="email" placeholder="you@company.com" required />
      </div>
      <div className="field">
        <label>Password</label>
        <input className="input" name="password" type="password" placeholder="Min. 8 characters" required minLength={8} />
      </div>
      {state?.error && <p style={{ fontSize: 13, color: "var(--color-accent-800)" }}>{state.error}</p>}
      <button type="submit" className="btn btn-primary btn-block" disabled={isPending}>
        {isPending ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}
