import { and, eq, gt, lt, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import { rateLimitEvents } from "@/db/schema";
import { UserError } from "@/lib/user-error";

// The one rate limiter: a sliding window over rows in rate_limit_events.
// `check` throws a translated UserError when the key is over its limit;
// `record` adds an attempt. Callers decide what counts — a login records
// only *failures*, so a person who knows their password is never blocked
// by their own successes; a reset request records every request.
//
// Postgres rather than in-memory because production runs as serverless
// functions with no shared memory, and rather than an external service
// because nothing here needs sub-millisecond precision.

export type Limit = { max: number; windowSeconds: number };

export const LIMITS = {
  loginEmail: { max: 10, windowSeconds: 15 * 60 },
  loginIp: { max: 40, windowSeconds: 15 * 60 },
  forgotPassword: { max: 5, windowSeconds: 60 * 60 },
  signup: { max: 5, windowSeconds: 60 * 60 },
  verificationResend: { max: 6, windowSeconds: 60 * 60 },
  emailChange: { max: 1, windowSeconds: 10 * 60 },
  inviteRenew: { max: 1, windowSeconds: 60 * 60 },
  contact: { max: 5, windowSeconds: 60 * 60 },
} as const satisfies Record<string, Limit>;

export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

export async function countRecent(key: string, limit: Limit): Promise<number> {
  const since = new Date(Date.now() - limit.windowSeconds * 1000);
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(rateLimitEvents)
    .where(and(eq(rateLimitEvents.key, key), gt(rateLimitEvents.createdAt, since)));
  return n;
}

export async function isLimited(key: string, limit: Limit): Promise<boolean> {
  return (await countRecent(key, limit)) >= limit.max;
}

// Throws the same translated line everywhere: "Too many attempts — try
// again in N minutes."
export async function assertNotLimited(key: string, limit: Limit) {
  if (await isLimited(key, limit)) {
    const t = await getTranslations("rateLimit");
    throw new UserError(t("tooMany", { minutes: Math.ceil(limit.windowSeconds / 60) }));
  }
}

export async function record(key: string) {
  await db.insert(rateLimitEvents).values({ key });
  // Opportunistic prune: anything older than the longest window is dead weight.
  if (Math.random() < 0.05) {
    await db.delete(rateLimitEvents).where(lt(rateLimitEvents.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000)));
  }
}
