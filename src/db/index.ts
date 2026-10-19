import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { activeTenant, inOwnerScope } from "./tenant-context";

type Db = ReturnType<typeof drizzle<typeof schema>>;
type Client = ReturnType<typeof postgres>;

// What `db.transaction(async (tx) => ...)` hands its callback — for
// functions that write inside a transaction the caller controls (see
// applyItemValues in src/lib/custom-fields.ts), not `Db` itself, which
// carries a `$client` a transaction object doesn't have.
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// Two connections (#228 phase 3):
//
// - owner: DATABASE_URL, the role that owns the tables and runs migrations.
//   Row-level security doesn't apply to it. Only code inside asOwner()
//   (src/lib/tenant.ts) — the deliberate cross-company paths — gets it.
// - app: DATABASE_URL_APP, a login role that is a member of app_user, so
//   every policy applies: with no company set it sees no company rows at
//   all. Everything else runs on it. Unset, it falls back to DATABASE_URL,
//   which is exactly how the app behaved before — setting the variable is
//   what turns phase 3 on, and removing it turns it off.
type Conn = "owner" | "app";

function urlFor(conn: Conn): string {
  const owner = process.env.DATABASE_URL;
  if (!owner) throw new Error("DATABASE_URL is not set");
  return conn === "app" ? process.env.DATABASE_URL_APP || owner : owner;
}

// The dev server re-evaluates this module on every HMR reload, which resets
// module-level state — each reload used to open a fresh pool while the old
// one stayed connected, until Postgres answered "sorry, too many clients
// already". A key on globalThis outlives module re-evaluation, so reloads
// keep reusing the pools opened by the first one. Production evaluates the
// module once, so the cache there is just a no-op.
const CACHE = Symbol.for("smartdepo.db.v2");
type Pool = { instance: Db; client: Client; url: string };
type Cache = Partial<Record<Conn, Pool>>;
const globalCache = globalThis as unknown as { [CACHE]?: Cache };
const cache: Cache = (globalCache[CACHE] ??= {});

// For the test runner: node --test waits for the event loop, and an open
// pool would keep it alive forever. The app itself never calls this.
export async function closeDb() {
  for (const conn of ["owner", "app"] as const) {
    await cache[conn]?.client.end();
    delete cache[conn];
  }
}

// Connects on first use, not at import — `next build` imports every
// route module while collecting page data, on a machine that has no
// DATABASE_URL, and used to fail right there. Nothing touches the
// database until a request actually runs a query.
function instance(conn: Conn): Db {
  const url = urlFor(conn);
  const current = cache[conn];
  if (current && current.url === url) return current.instance;
  // Editing .env reloads the dev server too; a cached pool would otherwise
  // keep talking to the database named by the previous value. The old pool
  // is closed in the background so its connections are not leaked either.
  if (current) void current.client.end();
  // `prepare: false` keeps the driver compatible with pooled/serverless
  // Postgres (Neon, Supabase pooler) which don't support named prepared
  // statements across connections.
  const client = postgres(url, { prepare: false });
  const created = { instance: drizzle(client, { schema }), client, url };
  cache[conn] = created;
  return created.instance;
}

function proxyTo(pick: () => Db): Db {
  return new Proxy({} as Db, {
    get(_target, prop) {
      const target = pick();
      const value = Reflect.get(target, prop);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

// The app connection itself, never a company transaction — what withOrg()
// opens its transaction on.
export const appPool: Db = proxyTo(() => instance("app"));

// Inside withOrg(), `db` is that company's transaction (app_user, one
// company); inside asOwner(), the owner connection; anywhere else, the app
// connection — which, once DATABASE_URL_APP is set, sees no company's rows.
export const db: Db = proxyTo(() => (activeTenant()?.tx as Db | undefined) ?? instance(inOwnerScope() ? "owner" : "app"));
