import * as Sentry from "@sentry/nextjs";

// Next.js loads this once per runtime. Server and edge get their own
// init (the edge runtime can't share the Node one); the browser side is
// src/instrumentation-client.ts.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await import("../sentry.server.config");
  if (process.env.NEXT_RUNTIME === "edge") await import("../sentry.edge.config");
}

// Errors thrown while rendering a server component or route handler —
// the ones a Server Action's attempt() doesn't see.
export const onRequestError = Sentry.captureRequestError;
