import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;

let instance: Db | null = null;

function connect(): Db {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  // `prepare: false` keeps the driver compatible with pooled/serverless
  // Postgres (Neon, Supabase pooler) which don't support named prepared
  // statements across connections.
  const client = postgres(connectionString, { prepare: false });
  return drizzle(client, { schema });
}

// Connects on first use, not at import — `next build` imports every
// route module while collecting page data, on a machine that has no
// DATABASE_URL, and used to fail right there. Nothing touches the
// database until a request actually runs a query.
export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    instance ??= connect();
    const value = Reflect.get(instance, prop);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
