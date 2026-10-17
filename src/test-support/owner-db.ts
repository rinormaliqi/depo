import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";

// What tests seed and assert with (#228 phase 3): the owner connection,
// which row-level security doesn't apply to. The app code under test keeps
// using `db` from "@/db", which in tests is the restricted login role
// (DATABASE_URL_APP, set in ./setup.ts) — so any app path that reads
// company rows outside withOrg()/asOwner() fails here as it would in
// production.
type Db = ReturnType<typeof drizzle<typeof schema>>;
let client: ReturnType<typeof postgres> | null = null;
let instance: Db | null = null;

export const ownerDb: Db = new Proxy({} as Db, {
  get(_target, prop) {
    if (!instance) {
      client = postgres(process.env.DATABASE_URL!, { prepare: false, onnotice: () => {} });
      instance = drizzle(client, { schema });
    }
    const value = Reflect.get(instance, prop);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

export async function closeOwnerDb() {
  await client?.end();
  client = null;
  instance = null;
}
