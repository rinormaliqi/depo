// Imported first by every integration test: points the app's db client at
// the test database (before src/db/index.ts reads DATABASE_URL), makes sure
// it exists and is migrated, and seeds the plans the code assumes exist.
import { after } from "node:test";
import { ensureTestDb, testDbUrl, truncateAll } from "./db";

process.env.DATABASE_URL = testDbUrl();
process.env.AUTH_SECRET ??= "test-secret";

export async function freshDatabase() {
  await ensureTestDb();
  await truncateAll();
}

// Close the app's pool when the file's tests finish so the runner exits.
after(async () => {
  const { closeDb } = await import("@/db");
  await closeDb();
});
