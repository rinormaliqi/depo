import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// A throwaway Postgres database on the same local server as dev
// (docker-compose.yml), created and migrated on first use. DATABASE_URL
// is pointed at it by src/test-support/setup.ts before src/db connects.
export const TEST_DB_NAME = "smartdepo_test";

function adminUrl() {
  const base = process.env.TEST_PG_ADMIN_URL ?? "postgres://postgres:postgres@localhost:5432/postgres";
  return base;
}

export function testDbUrl() {
  return adminUrl().replace(/\/postgres(\?.*)?$/, `/${TEST_DB_NAME}$1`);
}

export async function ensureTestDb() {
  const admin = postgres(adminUrl(), { max: 1 });
  const [row] = await admin`select 1 as ok from pg_database where datname = ${TEST_DB_NAME}`;
  if (!row) await admin.unsafe(`create database "${TEST_DB_NAME}"`);
  await admin.end();

  const client = postgres(testDbUrl(), { max: 1, onnotice: () => {} });
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  await client.end();
}

// Wipes every app table between test files. TRUNCATE ... CASCADE keeps the
// schema and is far faster than dropping/recreating the database.
export async function truncateAll() {
  const client = postgres(testDbUrl(), { max: 1 });
  const rows = await client<{ tablename: string }[]>`select tablename from pg_tables where schemaname = 'public' and tablename <> '__drizzle_migrations'`;
  const names = rows.map((r) => `"${r.tablename}"`).join(", ");
  if (names) await client.unsafe(`truncate ${names} restart identity cascade`);
  await client.end();
}
