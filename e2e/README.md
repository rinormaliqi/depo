# End-to-end tests

Browser tests for what only a browser can check — navigation, forms, file
uploads, the builder canvas, role-specific UI. Server actions themselves are
covered directly by `pnpm test` (`src/**/*.test.ts`); don't duplicate that here.

## Running them

They drive a local dev server against the local Docker Postgres, seeded with
the twelve `Test1234!` accounts:

```
docker compose up -d postgres
pnpm db:seed        # price list, once
pnpm db:seed:dev    # the six test companies
pnpm test:e2e
```

`playwright.config.ts` starts `pnpm dev` itself and reuses one already running.
Never point these at a deployed instance: the specs create, edit and delete,
and the seeded accounts only exist locally.

Accounts live in `helpers/accounts.ts`, one per role and billing state, mapped
from `ORGS` in `src/db/seed-dev.ts`. `helpers/fixtures.ts` gives you `adminPage`
and `workerPage`, already signed in.

## Selectors

The UI ships in Albanian and English and the copy changes often, so anchor on
input `name` attributes and ARIA roles, not on visible strings. There are no
`data-testid`s in the app and these tests don't add any.

## Expected failures

A test marked `test.fail()` documents a bug that is real and not yet fixed —
it is *expected to fail*, so the suite stays green and flips loudly the moment
the bug is fixed. Remove the `test.fail()` line with the fix.

There are none at the moment: the three the v1.4 sweep left behind (#126,
#128 and #138) were fixed and their markers removed.
