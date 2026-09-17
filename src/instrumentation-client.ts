import * as Sentry from "@sentry/nextjs";

// Browser-side Sentry. With no DSN (local dev, or an environment that
// hasn't set NEXT_PUBLIC_SENTRY_DSN) init() is a no-op — same
// degrade-gracefully rule as email and payments.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  // Errors only. No performance tracing or session replay — both eat the
  // free tier's quota and record more about a customer's warehouse than
  // the privacy policy promises.
  tracesSampleRate: 0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  sendDefaultPii: false,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
