import { compare } from "bcryptjs";
import { eq } from "drizzle-orm";
import NextAuth from "next-auth";
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
        if (!user || !user.passwordHash) return null;

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
      if (!email) return false;
      const user = await ensureUserFromGoogle({ email, name: profile?.name, emailVerified: profile?.email_verified === true });
      return !!user;
    },
    // The JWT carries *our* user id. Credentials returns it from
    // authorize(); for Google the `user` object is the OAuth profile, so
    // look the row up by email on the first sign-in.
    async jwt({ token, user, account }) {
      if (account?.provider === "google" && user?.email) {
        const [row] = await db.select({ id: users.id }).from(users).where(eq(users.normalizedEmail, normalizeEmail(user.email)));
        if (row) token.id = row.id;
        return token;
      }
      if (user) token.id = user.id;
      return token;
    },
  },
});
