"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

// Catches a render error in the root layout itself, where the normal
// error boundary can't run. Deliberately plain and English-only: if we
// got here, the i18n provider may be part of what broke.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 32, maxWidth: 480, margin: "0 auto" }}>
        <h1 style={{ fontSize: 20 }}>Something went wrong</h1>
        <p style={{ color: "#555" }}>The error has been reported. You can try again, or reload the page.</p>
        <button onClick={reset} style={{ padding: "8px 14px", cursor: "pointer" }}>Try again</button>
      </body>
    </html>
  );
}
