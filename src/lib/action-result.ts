// In production Next.js replaces the message of any Error thrown from a
// Server Action with a generic "An error occurred in the Server Components
// render" before it reaches the browser, so a user would never see
// "Verify your email to start your trial" or "Only managers can change
// the layout" — only in dev do thrown messages survive. Errors we *mean*
// the user to read therefore travel as a return value, not an exception.
//
// Server side: wrap the body of an exported action in attempt(). Client
// side: wrap the imported action in unwrap(), which turns the result back
// into a thrown Error so existing try/catch + setError code is untouched.
export type ActionResult<T> = { ok: true; value: T } | { ok: false; error: string };

export async function attempt<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    // redirect()/notFound() work by throwing; those must keep propagating.
    const digest = (e as { digest?: unknown })?.digest;
    if (typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest === "NEXT_NOT_FOUND")) throw e;
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function unwrap<A extends unknown[], R>(action: (...args: A) => Promise<ActionResult<R>>): (...args: A) => Promise<R> {
  return async (...args: A) => {
    const result = await action(...args);
    if (!result.ok) throw new Error(result.error);
    return result.value;
  };
}
