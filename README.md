# SmartDepo

Digitize a company's storage space, register every material/product against an exact
location, and let workers find or move anything in seconds via a phone.

Product concept, architecture, pricing, and data model decisions live in [docs/](docs/).

## Stack

One Next.js app (App Router, TypeScript) — no separate API service, no monorepo. Postgres
via Drizzle ORM. See [docs/architecture.md](docs/architecture.md) for the reasoning.

## Local development

```bash
cp .env.example .env
docker compose up -d
pnpm install
pnpm db:push
pnpm db:seed
pnpm dev
```

Open http://localhost:3000.

## Scripts

- `pnpm dev` — start the dev server
- `pnpm build` / `pnpm start` — production build and run
- `pnpm lint` / `pnpm type-check`
- `pnpm db:push` — sync the Drizzle schema to the database (local dev)
- `pnpm db:generate` — generate a SQL migration from schema changes
- `pnpm db:migrate` — apply migrations (production)
- `pnpm db:seed` — seed the `plans` table with the pricing tiers
- `pnpm db:studio` — browse the database
