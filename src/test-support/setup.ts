// Imported first by every integration test: points the app's db client at
// the test database (before src/db/index.ts reads DATABASE_URL), makes sure
// it exists and is migrated, and seeds the plans the code assumes exist.
import { after } from "node:test";
import { ensureTestDb, testAppDbUrl, testDbUrl, truncateAll } from "./db";

process.env.DATABASE_URL = testDbUrl();
// The app runs on the restricted login, as production does once
// DATABASE_URL_APP is set. TEST_DB_APP_ROLE=off runs it the way production
// runs before that — on the owner connection — to check that's unchanged.
if (process.env.TEST_DB_APP_ROLE !== "off") process.env.DATABASE_URL_APP = testAppDbUrl();
process.env.AUTH_SECRET ??= "test-secret";

export async function freshDatabase() {
  await ensureTestDb();
  await truncateAll();
}

// Close the app's pool when the file's tests finish so the runner exits.
after(async () => {
  const { closeDb } = await import("@/db");
  const { closeOwnerDb } = await import("./owner-db");
  await closeDb();
  await closeOwnerDb();
});
