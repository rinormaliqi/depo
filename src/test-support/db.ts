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
  // The app's restricted login, as in production once DATABASE_URL_APP is
  // set (#228 phase 3): a member of app_user, so every policy applies.
  // Roles are cluster-wide, so it is created once and reused.
  await client.unsafe(`
    do $$ begin
      if not exists (select from pg_roles where rolname = '${TEST_APP_ROLE}') then
        create role ${TEST_APP_ROLE} login password '${TEST_APP_PASSWORD}' in role app_user;
      end if;
    end $$;
  `);
  await client.end();
}

const TEST_APP_ROLE = "smartdepo_app_test";
const TEST_APP_PASSWORD = "app-test";

export function testAppDbUrl() {
  const url = new URL(testDbUrl());
  url.username = TEST_APP_ROLE;
  url.password = TEST_APP_PASSWORD;
  return url.toString();
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
