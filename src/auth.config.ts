import type { NextAuthConfig } from "next-auth";

// The database-free half of the Auth.js setup, shared by src/auth.ts and
// src/middleware.ts. The middleware runs on the Edge runtime on Vercel,
// where the Postgres driver can't load — it only needs to decode the JWT
// session cookie, which this config is enough for. The Credentials
// provider (which does hit the database in authorize()) lives in auth.ts.
export const authConfig = {
  session: { strategy: "jwt" },
  trustHost: true,
  // Every Auth.js failure (OAuth callback, configuration, access denied)
  // renders our own page instead of the unstyled default.
  pages: { signIn: "/login", error: "/auth-error" },
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
        session.user.sessionVersion = typeof token.sv === "number" ? token.sv : undefined;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
