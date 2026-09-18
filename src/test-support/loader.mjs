// Node module-resolution hook for `pnpm test`: swaps the handful of modules
// that only work inside a Next.js request (headers/cookies, next-intl's
// request-scoped translations, Auth.js, Sentry, cache revalidation) for
// small in-memory stubs, so the real src/lib and action code runs against
// a real Postgres. Registered via `--import ./src/test-support/register.mjs`.

const stubs = {
  "next/headers": "stubs/next-headers.ts",
  "next/cache": "stubs/next-cache.ts",
  "next/navigation": "stubs/next-navigation.ts",
  "next-intl/server": "stubs/next-intl-server.ts",
  "@sentry/nextjs": "stubs/sentry.ts",
};

export async function resolve(specifier, context, nextResolve) {
  if (specifier in stubs) {
    return { url: new URL(stubs[specifier], import.meta.url).href, shortCircuit: true };
  }
  // The real src/auth.ts pulls in NextAuth's route handlers; tests only
  // need auth() (settable) and signIn() (recorded).
  if (specifier === "@/auth" || specifier.endsWith("/src/auth.ts") || specifier.endsWith("/src/auth")) {
    return { url: new URL("stubs/auth.ts", import.meta.url).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
