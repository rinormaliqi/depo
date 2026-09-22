import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;
type Client = ReturnType<typeof postgres>;

// The dev server re-evaluates this module on every HMR reload, which resets
// module-level state — each reload used to open a fresh pool while the old
// one stayed connected, until Postgres answered "sorry, too many clients
// already". A key on globalThis outlives module re-evaluation, so reloads
// keep reusing the pool opened by the first one. Production evaluates the
// module once, so the cache there is just a no-op.
const CACHE = Symbol.for("smartdepo.db");
type Cache = { instance: Db | null; client: Client | null; url: string | null };
const globalCache = globalThis as unknown as { [CACHE]?: Cache };
const cache: Cache = (globalCache[CACHE] ??= { instance: null, client: null, url: null });

function connect(connectionString: string): Db {
  // `prepare: false` keeps the driver compatible with pooled/serverless
  // Postgres (Neon, Supabase pooler) which don't support named prepared
  // statements across connections.
  cache.client = postgres(connectionString, { prepare: false });
  cache.url = connectionString;
  return drizzle(cache.client, { schema });
}

// For the test runner: node --test waits for the event loop, and an open
// pool would keep it alive forever. The app itself never calls this.
export async function closeDb() {
  await cache.client?.end();
  cache.client = null;
  cache.instance = null;
  cache.url = null;
}

// Connects on first use, not at import — `next build` imports every
// route module while collecting page data, on a machine that has no
// DATABASE_URL, and used to fail right there. Nothing touches the
// database until a request actually runs a query.
export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set");
    }
    // Editing .env reloads the dev server too; a cached pool would otherwise
    // keep talking to the database named by the previous value. The old pool
    // is closed in the background so its connections are not leaked either.
    if (cache.instance && cache.url !== connectionString) {
      void cache.client?.end();
      cache.instance = null;
      cache.client = null;
    }
    const instance = (cache.instance ??= connect(connectionString));
    const value = Reflect.get(instance, prop);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
