"use client";

import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { signInWithGoogle } from "@/lib/actions/google";

// "Continue with Google" plus the "or" rule under it, for the auth forms.
// Rendered only when the page says Google is configured.
export function GoogleButton({ redirectTo, label }: { redirectTo: string; label?: string }) {
  const t = useTranslations("auth.google");
  const [pending, start] = useTransition();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 14 }}>
      <button
        type="button"
        className="btn btn-secondary btn-block"
        style={{ marginTop: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, background: "#fff" }}
        disabled={pending}
        onClick={() => start(() => signInWithGoogle(redirectTo))}
      >
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.8 6C12.3 13.4 17.7 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8C43.8 38 46.5 31.8 46.5 24.5z" />
          <path fill="#FBBC05" d="M10.4 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.8-6A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.8-6z" />
          <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.7-3.9-13.6-9.4l-7.8 6C6.5 42.6 14.6 48 24 48z" />
        </svg>
        {pending ? t("redirecting") : (label ?? t("continue"))}
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: "color-mix(in srgb, var(--color-text) 45%, transparent)" }}>
        <span style={{ flex: 1, height: 1, background: "var(--color-divider)" }} />
        {t("or")}
        <span style={{ flex: 1, height: 1, background: "var(--color-divider)" }} />
      </div>
    </div>
  );
}
