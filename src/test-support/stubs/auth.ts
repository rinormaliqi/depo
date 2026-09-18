// Settable session for tests: actAs(userId) makes auth() return that user.
let current: { user: { id: string; email: string; name: string } } | null = null;
export const signIns: unknown[] = [];

export function actAs(user: { id: string; email: string; name: string } | null) {
  current = user ? { user } : null;
}
export async function auth() {
  return current;
}
export async function signIn(provider: string, options: unknown) {
  signIns.push({ provider, options });
  // Real signIn() redirects on success, which throws — attempt()/actions
  // rely on nothing running after it. Mirror that.
  const e = new Error("NEXT_REDIRECT") as Error & { digest: string };
  e.digest = "NEXT_REDIRECT;replace;/builder;307;";
  throw e;
}
export async function signOut() {}
export const handlers = {};
