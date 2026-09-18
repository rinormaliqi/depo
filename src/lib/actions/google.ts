"use server";

import { signIn } from "@/auth";

// Kicks off the Google OAuth redirect. Only /welcome and /invite/<token>
// are accepted as landing places — /welcome bounces a user who already
// has an organization straight on to the blueprint, and the invite page
// finishes the join itself — so a crafted redirectTo can't send someone
// elsewhere after they've just authenticated.
export async function signInWithGoogle(redirectTo: string) {
  const safe = redirectTo === "/welcome" || /^\/invite\/[A-Za-z0-9_-]+$/.test(redirectTo) ? redirectTo : "/welcome";
  await signIn("google", { redirectTo: safe });
}
