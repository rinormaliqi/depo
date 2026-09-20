import { compare } from "bcryptjs";
import { eq } from "drizzle-orm";
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { authConfig } from "@/auth.config";
import { db } from "@/db";
import { users } from "@/db/schema";
import { normalizeEmail } from "@/lib/email-normalize";
import { ensureUserFromGoogle } from "@/lib/onboarding";

// "Continue with Google" is on only where a Google Cloud OAuth client has
// been configured — the button simply doesn't render otherwise, the same
// way every optional integration here degrades (email, Paysera, Sentry).
// Surfaces as `code` on the thrown error so the login action can say
// "this account signs in with Google" instead of "wrong password".
class GoogleOnlySignin extends CredentialsSignin {
  code = "google_only";
}

export function isGoogleSignInEnabled() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const [user] = await db.select().from(users).where(eq(users.email, email));
        if (!user) return null;
        if (!user.passwordHash) throw new GoogleOnlySignin();

        const valid = await compare(password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
    ...(isGoogleSignInEnabled()
      ? [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            // Only the identity: no offline access, no extra scopes.
            authorization: { params: { prompt: "select_account", access_type: "online", scope: "openid email profile" } },
          }),
        ]
      : []),
  ],
  callbacks: {
    ...authConfig.callbacks,
    // Google hands us a profile; our user row is keyed by (alias-collapsed)
    // email. Refuse an address Google itself hasn't verified — that's the
    // whole reason this path can skip our own verification email.
    async signIn({ account, profile }) {
      if (account?.provider !== "google") return true;
      const email = profile?.email;
      if (!email) return "/auth-error?error=GoogleNoEmail";
      const user = await ensureUserFromGoogle({ email, name: profile?.name, emailVerified: profile?.email_verified === true });
      // A refusal lands on our own error page with a specific reason,
      // not Auth.js's default AccessDenied screen.
      return user ? true : "/auth-error?error=GoogleUnverified";
    },
    // The JWT carries *our* user id. Credentials returns it from
    // authorize(); for Google the `user` object is the OAuth profile, so
    // look the row up by email on the first sign-in.
    // `sv` is the user's session_version at sign-in; "sign out everywhere"
    // bumps the column and getMySession() refuses older tokens.
    async jwt({ token, user, account }) {
      if (account?.provider === "google" && user?.email) {
        const [row] = await db.select({ id: users.id, sv: users.sessionVersion }).from(users).where(eq(users.normalizedEmail, normalizeEmail(user.email)));
        if (row) { token.id = row.id; token.sv = row.sv; }
        return token;
      }
      if (user?.id) {
        token.id = user.id;
        const [row] = await db.select({ sv: users.sessionVersion }).from(users).where(eq(users.id, user.id));
        token.sv = row?.sv ?? 1;
      }
      return token;
    },
  },
});
