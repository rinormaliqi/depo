# Architecture — SmartDepo

Guiding rule: this is a personal project on a personal budget. Every choice below is made to
minimize real monthly cost and avoid surprise bills, not to maximize scalability headroom we
don't need yet. Prefer boring, cheap, well-understood technology over anything that adds a
paid service before it's earned its keep.

## App shape: one deployable, not three

tender-ai runs `web` + `admin` + `api` as separate apps in a pnpm monorepo. SmartDepo does
**not** need that split — there's one developer and no reason to pay for/operate a separate
backend service yet.

**One Next.js app** (App Router), TypeScript, containing:
- UI routes for the visual builder, item search, dashboards
- Route Handlers / Server Actions in the same codebase acting as the "API"
- No separate Express/Fastify service, no separate admin app

This directly removes a whole deployable (and its hosting cost) compared to tender-ai's
structure. A monorepo split can happen later if a second real deployable (e.g. a public
marketing site) actually shows up — not before.

## Data layer

- **Postgres**, single database, multi-tenant via an `organization_id` column scoped in every
  query (row-level scoping in app code; Postgres RLS is a hardening option for later, not
  MVP).
- **Location tree:** plain adjacency list (`locations.parent_id`), queried with a recursive
  CTE. Handles thousands of nodes per company with no special extension. Explicitly rejected:
  `ltree`, nested sets, closure tables — solving a scale problem this product doesn't have.
- **ORM:** Drizzle (same as tender-ai — zero new learning curve, works fine on a normal
  Postgres instance, no vendor lock-in).
- **Stock model:** `item + bin (leaf location) + quantity`, plus an append-only `movements`
  table (who/what/from/to/qty/reason/timestamp) as the source of truth for "current location"
  and for stats.

## Auth

**Auth.js (NextAuth)**, users table in the same Postgres database. Rejected: Keycloak
(tender-ai's choice) — it needs its own JVM process plus its own database, which either needs
a bigger box or a second managed service. Auth.js adds zero infrastructure.

Roles (Admin / Manager / Worker) are a column on the user-organization membership, checked in
route handlers/middleware — no external authorization service.

### Team invites, roles and permissions

Signup only ever creates the first (admin) user for an org; everyone else arrives through
`invites` (`src/db/schema.ts`) — a pending-seat table keyed by a random bearer token, so the
invitee doesn't need an account yet. An admin/manager picks an email and a role on `/team`; the
app **emails** a `/invite/<token>` link (`sendInviteEmail` in `src/app/team/actions.ts`, via the
same `src/lib/email.ts` Resend path as password reset — it originally did *not* send mail, on
the grounds of not standing up email infra before a paying customer, but reset needed that infra
anyway, so the reason expired). The link is still shown on `/team` with a copy button: a
floor worker's inbox is not always reliable, and a mail-provider failure returns a translated
"created but couldn't send — share the link" error rather than throwing the seat away. Resend
re-sends the mail and extends the 7-day expiry; expired-but-unaccepted invites stay listed with
an "Expired" marker so they can be resent, not silently vanish.

`/invite/<token>` detects whether the invited email already has an account (compared on
`normalized_email`, so an invite to `me+work@gmail.com` finds `me@gmail.com`) and renders a
sign-in-to-accept or create-account-to-accept form. Either path writes the `membership` row,
marks the invite accepted and marks the user's email verified — the link reached that inbox,
which is the same proof signup's verification asks for — *before* calling `signIn()`, whose
redirect-on-success means nothing after it runs; the sign-in path checks the password directly
first for the same reason.

**Permissions** (`src/lib/permissions.ts`) are a small table, not scattered `if (role === …)`
checks: `moveStock` (everyone), `editLayout` / `manageItems` / `manageTeam` (admin + manager),
`manageBilling` (admin). `requirePermission(p)` is what every mutating server action now calls
instead of `requireActiveOrg()` — it runs the same lock check and then the role check, throwing a
translated message either way, so the lockout and the permission gate are one call site. Wired
into all of `builder/actions.ts`, `items/actions.ts`'s `createItem`, the scanner/bin stock
actions, and every `team/actions.ts` mutation. The split follows how a depot runs: workers move
stock all day and must not be able to reshape the layout by accident; managers run the depot
(layout, catalog, staffing) but not the company's wallet; admins own the account.

The UI mirrors the table rather than letting people discover a rule by hitting an error:
`getMyPermissions()` drives a `readOnly` prop on `BlueprintCanvas` (palette, templates, floor
settings, undo/redo, duplicate/delete hidden; drag and destructive shortcuts no-op'd; the
inspector wrapped in a disabled `<fieldset>` so numbers stay visible but uneditable) and hides
the item form for workers. Server enforcement is the real gate — verified by calling
`addSector` directly with a worker session and getting the permission error back.

`/team` also does member management: change role (a select per row) and remove. Rules, in
`changeMemberRole` / `removeMember`: the target must belong to this org; a manager can't touch
an admin seat in either direction (same cap as inviting — only an admin creates an admin);
nobody removes themselves; and **an org can never be left without an admin**
(`assertNotLastAdmin`), or nobody could manage the team or billing again. Removing deletes only
the membership row — the user, any other org they're in, and the `user_id` on movements they
logged all stay, so history remains attributable.

### Password reset

Unlike an invite link — which an admin deliberately hands to someone they already trust, so
showing them the link directly is fine — a "forgot password" flow exists specifically for a
user who's locked out with no one else in the loop, and handing the reset link to whoever
merely *typed* an email address (rather than proving they own that inbox) would let anyone
take over any account. That distinction is why invites could get away with no email
infrastructure at all and this can't: it needed an actual send path, not just a copyable link.

- **`src/lib/email.ts`** — two ways out, picked by what's configured. SMTP (`SMTP_HOST` /
  `SMTP_USER` / `SMTP_PASS`) is the production path for launch: the company Gmail
  (`pikembipresje@gmail.com`, also `NEXT_PUBLIC_SUPPORT_EMAIL` and the `companyInfo()`
  default) with an App Password, via nodemailer. Chosen because transactional providers only
  send *from* a domain you own and have verified DNS for, and there isn't one yet — the Gmail
  address is the real sender identity, and its ~500/day cap is far above verification + reset
  + invite volume. Resend (`RESEND_API_KEY`, a raw `fetch()` POST, no SDK) stays as the path
  once a domain is verified. With neither set — this repo's own local dev included — emails
  log to the server console instead of failing, so every flow stays testable. Replies go to
  the support address in both modes.
- **`password_resets`** (`src/db/schema.ts`) — a short-lived (1 hour, vs. an invite's 7 days),
  single-use token table. `usedAt` is set the moment it's redeemed, so the same link can't be
  replayed even within its window.
- **`/forgot-password`** always reports the same generic "if that email has an account, a link
  is on its way" outcome regardless of whether the email actually matches a user — confirming
  or denying it would let the page be used to enumerate real accounts by email.
- **`/reset-password/<token>`** mirrors the invite-accept page's shape (a valid/invalid split,
  translated), and reuses the exact "write to the DB before calling `signIn()`, not after"
  ordering the invite-accept flow established, for the same reason: `signIn()`'s own
  redirect-on-success means nothing after a successful call ever runs.

Real bug this surfaced, not really about password reset itself: `/forgot-password` and
`/reset-password/<token>` (and, it turned out, the *existing* `/invite/<token>` from the
invites work above) all returned a 307 to `/login` for a genuinely logged-out visitor.
`src/middleware.ts` allowlists public paths by exact string match (`/`, `/login`, `/signup`)
and redirects everything else unless a session exists — none of these token-bearing pages were
ever added to that list. The invite flow's own earlier testing never caught it because it
happened to run while still signed in as *some* user, which was enough to satisfy the
middleware's only real check (`!req.auth`) even though that user had no relationship to the
invite being tested. Fixed by adding an explicit public-prefix list (`/invite/`,
`/reset-password/`) alongside the exact-match set, so a token in the URL — the entire point of
being reachable while logged out — is never gated behind a login the visitor can't perform yet.

### Email verification — the trial starts when the inbox is proven

Signup used to hand out a 30-day trial to whatever was typed into the email field. `users.email`
was already `UNIQUE`, but nothing checked the inbox existed, and `me+1@gmail.com` / `me+2@gmail.com`
were as good as different people — a free trial forever, one alias at a time. Three pieces:

- **`users.normalized_email`** (`src/lib/email-normalize.ts`) — the alias-collapsed form: `+tag`
  stripped, dots stripped for Gmail/Googlemail. Unique; it's what signup's duplicate check and the
  invite-accept lookup compare on. The raw `email` is still what gets mail. Plus a short,
  hand-picked disposable-domain list (`src/lib/disposable-domains.ts`) — not a scraped 10k-entry
  blocklist, which goes stale and needs its own update job; extend it when an actual abuser shows
  up on `/internal`.
- **`email_verifications`** — the `password_resets` shape again (single-use bearer token), 24-hour
  window. `sendVerificationEmail()` / `consumeVerificationToken()` / `markEmailVerified()` live in
  `src/lib/email-verification.ts`. Resend from `/verify-email` has a 60-second floor so the button
  can't be used to make us spam an inbox.
- **The trial clock starts at verification, not signup.** Signup creates the org `trialing` with
  `trial_ends_at = NULL`; `getOrgLockReason()` reads that as a new `"unverified"` lock reason — the
  same read-only treatment as an expired trial (look around, save nothing), different message and
  a different fix. `markEmailVerified()` then sets `trial_ends_at = now + 30d` on any org the user
  founded (`memberships.role = 'admin'`, still `trialing`, no trial end yet). Doing it this way
  instead of "verified = allowed" means an unverified signup can't quietly burn its own trial
  before ever getting in, and it reuses the lockout rather than adding a second gate.

Accepting an invite (`/invite/<token>`) marks the user verified too: the link reached that inbox,
which is the same proof. Existing accounts were grandfathered in by the migration
(`email_verified_at = created_at`, `normalized_email = lower(email)`) — locking every current
customer out until they re-verify was never the goal. `/verify-email/<token>` is on the
middleware's public-prefix list, same as reset links: the click can come from a phone's mail app
with no session. `appBaseUrl()` (`src/lib/app-url.ts`) is the request-host-derived base every
emailed link now uses, pulled out of the reset flow so this one didn't copy it.

## Verification recovery

Everything that can go wrong with the verification mail has a way out on `/verify-email`:
resend (the 60-second floor shown as a countdown, an hourly cap behind it), **"Wrong address?
Change it"** — `changeUnverifiedEmail()` moves an *unverified* user to the corrected address
under signup's uniqueness and disposable-domain rules, kills the old tokens (a link to the
wrong inbox must never verify the new address) and sends a fresh one, one change per ten
minutes — a spam-folder hint naming the sender, and a contact link that pre-fills the
situation (`/contact?topic=verification`). `consumeVerificationToken()` now says *why* a link
is dead (`expired` / `used` / `unknown`), and the token page offers the matching next step: a
resend button right there for the signed-in owner of an expired link, "you're already
verified, log in" for a used one.

## Invite lifecycle

A dead invite link still names the company and the inviter: the page loads the row regardless
of state, tells the difference between expired / used / unknown, and an expired one offers
"Ask {inviter} for a new invite" — `requestNewInvite()` (public, one email per invite per hour)
mails the inviter a link to the Team page, where Resend already exists. Members can **leave**
an organization (`leaveOrganization`: deletes their membership, moves the org cookie to another
company or lets `/start` send them to `/welcome`); the only admin cannot, and is told to hand
over first. **Make owner** (`transferOwnership`, admins only) promotes another member to admin
and steps the caller down to manager in one transaction, so an organization never has zero
admins and never gets stuck with one person. Tests: `src/tests/invite-lifecycle.test.ts`.

## Account settings

`/account` (every role, from the ⋯ menu) — `src/lib/account.ts` behind `src/app/account/actions.ts`:
name; **email change** as a two-step (the new address must prove itself: a pending row in
`email_changes` and a link mailed to the *new* inbox, `/account/confirm-email/<token>`, public,
24 hours, single-use, uniqueness rechecked at confirm time so a race can't steal an address);
**password** (a password user proves the current one, a Google-only user just sets their first —
and is told that's how to add email + password sign-in); **sign out everywhere** — bumps
`users.session_version`, which the JWT carries as `sv` from sign-in and `getMySession()` compares
on every request (the edge middleware can't check the DB, so an old token is treated as signed
out by the app rather than at the edge); **delete account** — erasure, not row removal: movements
keep `performed_by` so a depot's history stays complete, the user row loses everything personal
(email → `deleted-<id>@deleted.invalid`, no name, no password), memberships go, companies where
this was the only member are deleted with all their data (explicit, bottom-up through the
non-cascading foreign keys), and the only admin of a shared company is refused until they hand
over. Confirmation asks for the email address to be typed. Tests: `src/tests/account.test.ts`.

## Items import — the catalogue from a spreadsheet

Typing a depot's catalogue one form at a time was the onboarding wall a 30-day trial would
expire behind (#85). `/items/import` (managers and admins, `manageItems`) takes the list the
company already has: paste straight from Excel (tab-separated) or open a CSV — `;` as a
European Excel saves it, or `,`. `src/lib/import-items.ts` is the pure parser (delimiter
detection on the first line, RFC 4180 quoting, a header row recognised by sq/en column names
in any order, otherwise positional `name, unit, sku, category` — required columns first so a
two-column paste works); it returns rows and per-line errors, never throws. Two server
actions in `src/app/items/import/actions.ts`: **preview** re-parses on the server and reports
`{create, update, errors}` plus the first rows as they'd be saved — the only confirmation
there is — and **commit** re-parses the same text again (rows are never trusted from the
browser), refuses if a single line is wrong, and writes in one transaction: rows with a SKU
upsert on the new partial unique index `items_org_sku_idx (organization_id, sku) where sku is
not null` (migration 0012, which first suffixes any pre-existing duplicates `-2`, `-3`…), rows
without one are plain inserts and never merge. The client pins the preview to the exact text
it was computed for, so editing the box hides the import button until the next check. Limits:
5,000 rows, 2 MB, 200 characters a field. `createItem` reports a taken SKU rather than the
constraint error. Tests: `src/lib/import-items.test.ts` (parser), `src/tests/items-import.test.ts`
(actions, isolation, roles).

**Export** closes the loop: `/items/export` (route handler, `manageItems`) is the catalogue in
the import's own shape — `name;unit;sku;category` — so export → edit in Excel → import is the
bulk-edit path (SKU lines update in place; SKU-less lines can only be created again, which the
preview says); `/stock/export` (every role, it's what `/stock` shows) is the current facility's
stocked bins as `item;name;location;quantity;unit`, where `item` is the SKU or, without one,
the name — what the stock import takes back. `src/lib/csv.ts` writes both: `;` separated like
the templates, UTF-8 BOM so Excel keeps "ç" and "ë", CRLF, RFC 4180 quoting; the header
detection in `import-table.ts` skips columns it doesn't know (the export's `unit`, a company's
own `price`) as long as most are recognised. Reading, so a locked company can still take its
data out. Tests: `src/lib/csv.test.ts` (round trip through the parsers), `src/tests/csv-export.test.ts`.

**Edit and delete** (`src/app/items/items-list.tsx`, `updateItem` / `deleteItem`): a row on
`/items` opens into a one-line form (name, unit, SKU, category — same rules as create, a taken
SKU named). Delete only while nothing ever happened to the item: stock on the floor is refused
("pick it first"), and any movement — even a fully picked one — keeps it, since the depot's
history stays complete (the rule that keeps `performed_by` on a deleted account); emptied
`stock` rows (quantity 0) go with it. The list shows each item's total on the floor so the
answer is visible before the click. Tests: `src/tests/items-edit-delete.test.ts`.

**Stock import** (`/stock/import`, from `/stock`, same `manageItems` gate — the count is a
setup task, not floor work) is the inventory count as a list: `item, location, quantity`.
`src/lib/import-table.ts` holds the text-to-cells half both imports share (delimiter, quoting,
header mapping); `src/lib/import-stock.ts` reads the rows (`item` is a SKU or, for a catalogue
without SKUs, an exact item name; `location` is the bin code on the label, upper-cased like the
Scanner; `quantity` a whole number above zero, spreadsheet thousands separators tolerated).
`src/app/stock/import/actions.ts` resolves every row against the catalogue (SKU first, then
name — a name two items share is `itemAmbiguous`, not a guess) and the *current facility's*
bins, and the commit writes one `receive` movement per line (the count sheet is the audit
trail) plus the stock upsert summed per item × bin, added to what's already there — the same
outcome as `receiveStockAt()` once per line, in one transaction. `src/components/paste-import.tsx`
is the shared paste → check → import client for both. Tests: `src/lib/import-stock.test.ts`,
`src/tests/stock-import.test.ts`.

## Sign-in hardening

`src/lib/rate-limit.ts` is the one limiter: a sliding window over rows in `rate_limit_events`
(migration 0010), Postgres-backed because production is serverless functions with no shared
memory. `LIMITS` names every window; callers decide what counts. Login records only
*failures* (per address and per IP, checked before `signIn` so a blocked address isn't even
tried), so nobody locks themselves out by signing in a lot; password reset records every
request and, over the limit, still shows "sent" while sending nothing (no enumeration, no
mail flood); signup is per IP; verification resend has an hourly cap on top of its 60-second
floor; the contact form uses the same helper. The message is one translated line everywhere.

`authorize()` throws a `CredentialsSignin` subclass with `code = "google_only"` for an account
with no password hash, and the login action turns that into "this account signs in with
Google" instead of "wrong password". `pages.error` is `/auth-error`: every Auth.js failure
(OAuth callback, configuration, access denied, expired link) renders our page with a plain
sentence per code; the Google `signIn` callback returns `/auth-error?error=GoogleUnverified` /
`GoogleNoEmail` rather than `false`, so a refusal explains itself. After a failed login the
form points at "Forgot password". Tests: `src/tests/rate-limit.test.ts`.

## Sign in with Google

Optional, on only when `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are set (`isGoogleSignInEnabled()`
in `src/auth.ts`; the button simply doesn't render otherwise). The provider requests identity
only (`openid email profile`, no offline access). What's ours is in `src/lib/onboarding.ts`:

- **One inbox, one user.** The `signIn` callback runs `ensureUserFromGoogle()`: an address
  Google hasn't marked `email_verified` is refused; otherwise the user is looked up on the same
  alias-collapsed `normalized_email` the password signup uses, so a password user who later taps
  "Continue with Google" with the same address gets *their* account. A new address gets a row
  with no `password_hash` and `email_verified_at` set — Google vouched for the inbox, so there
  is no verification email. The `jwt` callback then puts our user id (not Google's) in the token.
- **The company question.** A Google sign-in lands on `/welcome` (protected): a user who already
  has a membership is bounced to `/builder`; a new one is asked the one thing the signup form
  asks that Google can't answer, the company name, and `createOrganizationForFounder()` creates
  org + admin membership + facility with the 30-day trial starting immediately. The password
  signup now goes through the same function with `emailVerified: false` (trial starts at
  verification, as before). `/builder` redirects a session with no membership to `/welcome`.
- **Invites.** The invite page, when opened with a session (right after "Accept with Google"
  from that page), runs `acceptInviteViaSession()`: joined if the session's normalized email is
  the invited one, a "signed in as X, invited as Y" message otherwise. Password acceptance is
  unchanged.
- `signInWithGoogle(redirectTo)` only honours `/welcome` and `/invite/<token>` as landing places.

Google Cloud side: APIs & Services → Credentials → OAuth client ID (Web application) with
authorized redirect URI `<host>/api/auth/callback/google` for each host (the `*.vercel.app`
one and, later, the domain). Tests: `src/tests/google-signin.test.ts`.

## Billing — prepaid periods via Paysera, with manual activation kept

`docs/pricing.md` ("Billing v2") has the why: Paysera because Stripe won't onboard a Kosovo
business; prepaid 1/3/12-month periods because Paysera's recurring billing is merchant-initiated
token charging that isn't worth building before there's renewal volume. The pieces:

- **`src/lib/paysera.ts`** — the Checkout Classic (WebToPay) protocol as two pure functions,
  ported from Paysera's own `lib-webtopay` rather than adding a dependency: `data` is url-safe
  base64 of a query string, `sign`/`ss1` is `md5(data + project password)`. Unit-tested
  (`paysera.test.ts`, `pnpm test`). Config is `PAYSERA_PROJECT_ID` / `PAYSERA_SIGN_PASSWORD` /
  `PAYSERA_TEST_MODE`; with them unset `/billing` shows the bank-transfer/contact path only,
  the same degrade-gracefully pattern as email without `RESEND_API_KEY`.
- **`payments`** (`src/db/schema.ts`) — one row per attempt, `provider` = `paysera` or
  `manual`. Its id is the Paysera `orderid`, so a callback maps to exactly one attempt.
  `period_start`/`period_end` record what the payment actually bought — the answer to "why does
  my access end on that date".
- **`startCheckout`** (`src/app/billing/actions.ts`) — admin-only (a locked org must still be
  able to pay its way out, so it checks the role but not the lock), refuses a plan the org's
  current usage already exceeds (`limitsExceeded` — a 700-bin depot can't buy Starter and lock
  itself out of its own racks), inserts a pending row and redirects to Paysera.
- **`/api/billing/paysera/callback`** — the only path that grants access. Verifies `ss1`,
  checks the project id, refuses a test-mode/live mismatch, and on `status=1` checks the
  *paid* amount and currency against the row before calling `applyPaidPayment()`. Answers a
  plain `OK` for every recognised callback, including ones it ignores, because Paysera retries
  anything else. Had to be added to the middleware's public-prefix list — Paysera's servers have
  no session, and the first curl came back as a 307 to `/login`. `/billing/return` (the
  customer-facing redirect) only *displays* what the callback recorded; it never trusts the
  redirect itself, which anyone could type into a browser.
- **`applyPaidPayment()`** (`src/lib/billing.ts`) — the single place `paid_until` moves,
  used by both the callback and `/internal`'s "+ Payment" (a bank transfer the founder saw
  land). Idempotent per payment row (callbacks get redelivered). The new period starts from the
  current `paid_until` when the org is active on the same plan and still inside it — paying
  early extends — and from now otherwise. Sets `plan_id`, `subscription_status = active`,
  clears `trial_ends_at`.
- **Lockout** — `getOrgLockReason()` gained `"expired"`: `active` with a past `paid_until`. A
  null `paid_until` on an active org means "paid indefinitely", the founder's override on
  `/internal` (which now also edits `paid_until` directly).
- **Reminders without a scheduler** — `src/lib/billing-reminders.ts`. There's no cron in
  this app (see Background jobs), so `getBillingSummary()` — which every page's header calls —
  runs the check: within 7 days of the trial end / `paid_until`, and
  `expiry_reminder_sent_for` doesn't already equal that date, claim the date (an UPDATE, before
  sending, so two concurrent loads can't both mail) and email the admins. The honest trade-off:
  an org nobody opens for a week gets no reminder, but that org isn't the one renewing on time
  either.
- **`/billing`** — plan cards (Starter/Business selectable, Enterprise "contact us"), period
  selector with the total, Pay button, usage bars, and paid-payment history. Non-admins see
  the status and usage and a note to ask an admin. The header pill now also shows "Renew in
  Nd" inside the last week and "Expired" after.

Verified end to end against the local dev server with dummy Paysera credentials: checkout
redirects to `bank.paysera.com` with a correctly signed request; a locally signed `status=1`
callback activates the org for exactly the months bought, a replay is a no-op, a tampered
signature is a 400, a wrong `payamount` marks the row failed without granting access, a second
purchase chains from the previous `period_end`, an expired `paid_until` locks writes with the
"paid period has ended" message, and the reminder marker is claimed on the first page load
inside the 7-day window.

### Public pages: pricing, terms, refunds, contact

Paysera's payment-collection annex (and its project reviewers) expect the merchant site to show
full prices, terms, a refund policy and contact/company details before a project is approved —
and the same pages are what keep a customer dispute from ever reaching Paysera's >2%/>5%
complaint thresholds. `/pricing` reads the live `plans` rows, so the number a prospect sees is
the number `/billing` charges. `/terms`, `/refunds` and `/privacy` render `src/content/legal.ts` — long
prose kept as data per locale rather than in `messages/*.json`, so a legal redline never touches
UI strings; Albanian is the binding version and the English text says so. Company identity
(`NEXT_PUBLIC_LEGAL_NAME` / `_COMPANY_REG_NO` / `_COMPANY_ADDRESS`, `src/lib/company.ts`) is
env-driven because it changes exactly once, at ARBK registration. Refund policy as written: 30
days free, then full refund within 14 days of any payment, no questions — we absorb Paysera's
non-refundable commission on those (1%, cheaper than a dispute). Signup links all three documents. The privacy policy is written for what the app actually does
— strictly-necessary cookies only (so no consent banner), Vercel Web Analytics as the one
usage measure (page views; cookieless, a request hash that expires in 24h, so still no banner —
`<Analytics/>` in the root layout), named subprocessors (Vercel, Neon, Gmail, Sentry, Paysera), payment data never touching our servers, Kosovo's Law 06/L-082
plus GDPR where applicable — rather than a generic template; if any of those facts change (an
analytics tool, a new provider), the policy has to change with them.

### User-facing errors from server actions survive production

First real bug from the Vercel deploy: applying a template on an unverified org showed "An error
occurred in the Server Components render" instead of "Verify your email…". In production
Next.js masks the message of any Error *thrown* from a Server Action before it reaches the
browser; only dev shows it. Every lock, permission and plan-limit check threw, so none of those
messages would ever have reached a real user. `src/lib/action-result.ts`: server side, an
exported action's body runs inside `attempt()` and comes back as `{ok, value} | {ok, error}`
(redirect/notFound are rethrown — they work by throwing); client side, `unwrap()` turns that
back into a thrown Error, so the canvas/team/scanner `try { … } catch { setError }` code is
unchanged. Form-state actions (`useActionState`) already returned `{error}` and needed nothing.
Verified on a production build: the last-admin error arrives as `{"ok":false,"error":"…"}`.

### Error monitoring: Sentry, and the UserError split

`@sentry/nextjs` with the standard three inits (`src/instrumentation-client.ts`,
`sentry.server.config.ts`, `sentry.edge.config.ts` via `src/instrumentation.ts`), `onRequestError`
for server-component/route-handler failures, `src/app/global-error.tsx` for a crash in the root
layout, and `withSentryConfig` in `next.config.ts`. Errors only: tracing and session replay are
sampled at 0 — they burn the free tier and would record more of a customer's warehouse than the
privacy policy promises. The SDK posts through `/monitoring` (a tunnel route, allowlisted in the
middleware) so ad blockers don't eat reports. With no `NEXT_PUBLIC_SENTRY_DSN` everything is a
no-op, same as email and payments; source-map upload only happens when `SENTRY_AUTH_TOKEN` is set
at build time.

The more important change is what wiring it exposed: `attempt()` was returning *every* thrown
message to the browser, so a DB outage would have shown a customer `Failed query: select …` —
and Sentry would never have heard about it, because nothing threw past the action. Now there is
`UserError` (`src/lib/user-error.ts`), and every `throw new Error(t(…))` in the app is a
`UserError` — by construction those are the messages meant for a person. `attempt()` forwards a
`UserError`'s message; anything else is captured to Sentry tagged with the action name, logged,
and the user gets `common.errorGeneric`. Verified on a production build: a bad UUID into
`changeMemberRole` yields `{"ok":false,"error":"Diçka shkoi keq"}` with the real query error in
the server log, while the last-admin rule still returns its own sentence.

`/internal` has two founder-only buttons ("Throw server error" / "Throw client error") to prove
the pipeline end to end once a DSN exists — the ticket's acceptance test, made repeatable.

### Tests: the paths a regression would hurt most

Zero tests was fine while it was one person building; it isn't once there's customer data and
money. `pnpm test` (node's built-in runner via `tsx`) covers the four areas in the ticket, as
**integration tests against a real Postgres** — the guarantees are about SQL scoping and
arithmetic, and mocking the database would prove nothing:

- **Tenant isolation** — org A can't read or write org B's bins, items or stock through the
  helpers every write path uses, nor through the read actions a signed-in user calls.
- **Stock arithmetic** — after any receive/pick sequence `stock.quantity` equals the signed sum
  of `movements`; an over-pick or a non-positive quantity changes nothing; a locked org can't
  move stock.
- **Plan limits, lockout, permissions, payment maths** — every `getOrgLockReason()` state,
  seats counting live-but-not-expired invites, `requirePermission()` checking lock *and* role,
  and `applyPaidPayment()`'s extend-vs-restart rule and idempotency.
- **Flows** — signup creates an unverified user with no trial end and refuses aliases and
  disposable domains; the verification token starts a 30-day trial once; invite acceptance
  joins with the right role and marks the inbox verified; the Paysera callback activates on a
  valid signature, ignores replays, rejects a bad signature, fails on a wrong amount, and still
  answers `OK` to what it ignores.

How it runs: `src/test-support/setup.ts` points `DATABASE_URL` at `smartdepo_test` on the same
local server as dev, creates and migrates it on first use, and truncates between files.
Files run serially (`--test-concurrency=1`) because they share that database. A Node loader
(`src/test-support/loader.mjs`) swaps the modules that only work inside a Next request —
`next/headers`, `next-intl/server` (translations resolve to their key, so assertions match on
`planLimit.bins` rather than copy), `@/auth` (settable `actAs()`, `signIn()` throws the same
redirect production does), Sentry, cache revalidation — so the real `src/lib` and action code
runs unchanged. `src/db/index.ts` gained `closeDb()` purely so the runner's event loop can
exit. `.github/workflows/ci.yml` runs lint, type-check and the suite with a Postgres service on
every PR.

## Capabilities — role × plan × org state, resolved once

`src/lib/capabilities.ts` is the one answer to "can this user do X here?". It combines three
inputs and says *why* when the answer is no, so a blocked button and a blocked action show the
same toast:

- **Role permissions** — `src/lib/permissions.ts` keeps the table of who may do what
  (`moveStock`, `editLayout`, `manageItems`, `manageTeam`, `manageBilling`). These are *actions*
  and are also off while the org is locked (unverified / trial ended / expired / past due /
  canceled — `getOrgLockReason()` in `session.ts`).
- **Plan entitlements** — `plans.features` (jsonb, seeded per plan: `printLabels`,
  `cameraScanning`, `viewMetrics`) plus the limits (`max_users`, `max_facilities`, `max_bins`,
  `movement_history_months`). `multiFacility` is implied by `max_facilities > 1` rather than a
  flag. A feature a plan doesn't include is off for every role; reading stays allowed on a
  locked org. An **empty** feature map means "not configured → everything included" (how every
  plan shipped before the column existed); a non-empty map is authoritative. That default is
  what keeps a missed backfill from switching the product off (#68: production applied
  migration 0006 from a preview build before its backfill was appended). Today every plan
  includes every feature — the mechanism exists so the price list can differentiate without a
  code change.
- **Usage** — `loadUsage()` (members + pending invites, facilities, bins) — the same counter
  `/billing` displays and the limit checks compare against.

`resolveCapabilities()` is pure (`capabilities.test.ts` is table-driven over role × plan × lock).
Server actions call `requireCapability(cap)` (throws the translated `UserError`) and
`requireRoom(orgId, limit, additional)` before adding something — "usage + what's about to be
added must fit", one query, so a template with more bins than the plan allows is refused up
front. `requirePermission()` and the `assertCanAdd*` helpers are kept as thin wrappers so the
existing actions didn't have to change.

UI: the root layout resolves the signed-in user's capabilities once per request
(`capabilitiesForClient()`, with the translated reason per blocked capability) into
`<CapabilitiesProvider>`; components use `useCapabilities()` / `useCan()` or wrap a control in
`<Gate capability mode="hide"|"disable">` — hide for things a role should never see, disable (dim +
explain-on-tap toast) for things an upgrade or verification would unlock. Server components read
`getCapabilities()` directly (builder read-only, items form, bin page's label link, metrics).

Where the checks sit today: bins in `createEntity` / `applyTemplate` / `updateEntity` (bays ×
levels delta) / `duplicateEntity` / `restoreEntity`; seats in `createInvite`; facilities in
`createFacility` (plus `multiFacility`); `printLabels` in `getLabelBins`; `cameraScanning` in
`resolveScan`; `viewMetrics` on `/metrics`. Every check throws a translated `planLimit.*`,
`permission.*`, `capability.plan.*` or `orgLocked.*` message that the notification system shows
as-is.

## Trial-expiry lockout

`organizations.trial_ends_at`/`subscription_status` were set at signup and then never read
again — a trial that "ended" had no actual effect. `docs/pricing.md`: a trial that ends without
payment moves the org to "a locked/read-only state (data preserved, not deleted)". `src/lib/
session.ts`'s `getOrgLockReason()` is the single source of truth for whether an org is locked,
and it's broader than the ticket's title suggests: not just an expired trial, but any status
that isn't an active paid plan —
- `active` → never locked, `trial_ends_at` becomes irrelevant once actually paying.
- `trialing` → locked only once `trial_ends_at` has passed.
- `past_due` / `canceled` → locked immediately, no grace period. There's no automatic dunning
  or payment-retry system in this manual-activation v1 (see the Billing section above) — these
  statuses are only ever set by the founder by hand on `/internal`, so if they've set one,
  they clearly intend it to take effect right away.

`requireActiveOrg()` is the write-path counterpart to `requireSession()`/`requireOrgId()` —
call it instead at the top of anything that mutates org-scoped data; reads stay on the plain
session helpers so a locked org can still view everything it already built. Wired into every
actual write path in the app (confirmed by grepping every file for `db.insert`/`db.update`/
`db.delete` and checking each one): all of `builder/actions.ts`'s mutations (including
`restoreEntity`, undo/redo's own recreate path — locked blocks that too, consistently, since
it's still a write), `items/actions.ts`'s `createItem`, and `team/actions.ts`'s
`createInvite`/`revokeInvite`/`resendInvite`. `receiveStockAt`/`pickStockAt`
(`src/lib/stock.ts`) check once in the shared core rather than at each caller, which covers
both the Scanner and the bin-detail page's add/remove-stock forms from a single call site.
Accepting an invite (`src/app/invite/[token]/actions.ts`) has no session yet at that point in
the flow — it checks the *invited org's* lock status directly via `getOrgLockReason()` rather
than through `requireActiveOrg()`, using the token, not `requireActiveOrg()`'s session lookup.

Deliberately untouched: `/internal`'s `updateOrgBilling` — it's the only way to *unlock* an
org, gated separately by `requirePlatformAdmin()`, and would be useless if it could lock itself
out. Also untouched: signup (a brand-new org has no lock status yet), login/logout, and the
locale-switch cookie action (a per-viewer preference, not org data).

The trial/plan pill already added to `AppHeader` for the Billing ticket doubles as this
ticket's required banner — no separate banner needed, it already shows "Trial ended" (or "N
days left", urgent-styled once ≤5 remain) with a link to `/billing`.

Verified live end to end, not just by reading the code: expired the test org's trial and
confirmed every write path above is blocked with the correct translated message while
`/metrics` (a pure read) still renders fully; separately spot-checked `past_due` produces its
own distinct message; confirmed zero partial writes against Postgres directly, not just the
UI; then restored the org and confirmed normal writes resume immediately.

## Organizations — one person, several companies

`getMySession()` used to take the *first* membership row; a contractor invited into a second
company joined silently and kept seeing the first (#74). Now the current organization is an
explicit per-browser choice like the facility and the locale: `src/lib/organizations.ts` keeps
it in the `smartdepo_org` cookie, validated against the user's memberships on every read and
defaulting to the **most recently joined** — which is what a just-accepted invite should land
in. Every path that creates a membership (`createOrganizationForFounder`, both invite
acceptances, `acceptInviteViaSession`) remembers the new organization; `/start` then routes by
the role there. `OrganizationSwitcher` appears in the header only for users with more than one
membership (name · role), and switching revalidates the layout and goes through `/start`. The
invite page tells an existing user that accepting *adds* the company alongside their current
ones. Everything else was already scoped by `organizationId`; `src/tests/multi-org.test.ts`
covers the cookie default, override, fallback and the cross-company invite.

## Role-specific navigation

`src/lib/navigation.ts` decides what the app shows from capabilities (not the role name, so a
plan that drops a feature drops its tab): workers get **Find** (`/stock`), **Scan**, **Labels**
and the **map** (read-only blueprint) and no management links at all — no items, team, billing,
plan pill or floor dimensions; managers get Blueprint / Stock / Metrics / Scanner plus Items and
Team; admins add Billing. `AppHeader` reads `useCapabilities()` and renders exactly that. On
phones the primary tabs live in a fixed **bottom bar** under the thumb (`.app-nav-bottom`), the
header keeps a single row (wordmark, facility switcher, ⋯ menu — the plan pill moves into the
menu), and the toaster sits above the bar (`--bottom-nav`).

While the organization is locked, `LockBanner` (in `AppHeader`, every role) says why in plain
words: admins get the fix (Billing / verify email), everyone else is told the stock is
read-only and whom to ask — the admins' names as mailto links, loaded into the client
capabilities payload only when locked (#77). The invite page carries the same note.

`/start` is where every sign-in lands (login, invites, Google via `/welcome`): it routes by role
— workers to `/stock`, others to `/builder`, no organization yet to `/welcome`. A page a role
can't use (`/team`, `/billing`, `/items`, `/metrics`) renders `<NotForRole>` — the normal header,
one calm line with the capability's reason, and a way back — rather than an error.

## Phone layout for the worker surfaces

`docs/concept.md` promised "mobile-first" and there wasn't a single media query. The four
surfaces a worker touches — `AppHeader`, `/stock`, `/scanner`, `/builder/bin/[id]` — now have a
phone layout under 768px, done as class hooks on the existing inline-styled markup plus one
block of media queries in `globals.css`, so desktop rendering is byte-for-byte what it was.
The builder canvas is deliberately untouched (a desk tool, per the role split).

- **Header**: row 1 logo + facility + plan pill + a ⋯ toggle; row 2 the four tabs at equal
  width; the search/Items/Team/Billing/locale/sign-out row is hidden until ⋯ is tapped. Two
  rules needed `!important` because the markup sets `display:flex` inline for the desktop row.
- **Inputs go to 16px** on phones — iOS zooms the whole page when a focused input is smaller,
  which was the single most disorienting thing on the old layout. Buttons get 44px targets.
  Quantity fields carry `inputMode="numeric"`; the location code field turns off autocorrect and
  capitalises (codes are `A-01-3`, the keyboard kept "fixing" them).
- **/stock** collapses to search-on-top, zones below; result cards get 15px text and roomier
  taps. **/scanner** form fills the width and the movements table scrolls inside its own box
  rather than widening the page. **Bin detail** stacks item select → quantity + Shto → Hiq.

Verified at 375×812 in the Browser pane (not just a narrow desktop window): searched an item and
read its location with zero horizontal overflow; booked stock through the Scanner with touch
clicks only; added/removed from the bin page; opened the ⋯ menu. Re-checked at 1280 that the
desktop layout is unchanged.

## Multiple facilities per organization

`docs/pricing.md` sold Business as "3 facilities" while `getMyFacility()` did `LIMIT 1` with a
comment admitting switching wasn't built. Now:

- **Which facility you're in is a cookie** (`smartdepo_facility`, `src/lib/facilities.ts`),
  exactly like the locale — a per-browser preference, not a column on the membership. The same
  admin can have one site's blueprint on a desk monitor and another site's scanner on a phone.
  The cookie only holds an id and is validated against the org on every read; stale or forged →
  the org's first facility. `getMyFacility()` honours it, and since every facility-scoped page and
  action already read through that one function, switching is a cookie write plus a layout-wide
  `revalidatePath` — nothing else had to learn there is more than one.
- **`FacilitySwitcher`** replaces the static name in `AppHeader`: a `<select>` styled as plain
  text, self-fetching like the billing pill (`getMyFacilities()` returns the list plus whether
  the caller may add — the switcher must not import `src/lib/permissions.ts`, which would pull
  server code into the client bundle). "+ Add facility" prompts for a name; `createFacility` is
  `editLayout`-gated and the first real caller of `assertCanAddFacilities()`, written for this
  in the plan-limits work. Renders as the plain name while the org has one facility and the
  user can't add.
- **`BlueprintCanvas` is keyed by facility id** — it seeds its own state from props once, and
  `router.refresh()` alone left the old floor on screen after a switch. Real bug found in
  testing, not theory.
- **Scoping audit, three leaks fixed**: the bin page resolved its breadcrumb against the
  *current* facility instead of the bin's own (a search or QR link can open a bin in another
  site); the scanner's "recent movements" and the metrics log listed org-wide movements but
  labelled them against one facility's locations ("→ —"). Both are now per facility. Stock
  search stays deliberately **org-wide** — "where is X" shouldn't stop at the site you have
  open — but resolves paths across all facilities and prefixes the facility name when the hit
  is elsewhere (`Main Facility › A · A-01 · A-01-3`).

Verified: added a second and third facility from the header, the fourth refused with the
translated plan-limit message; each facility has its own blueprint (12 bins vs 0); billing usage
reads 3 / 3; cross-site search shows the prefixed path; scanner/metrics are empty in the new
site and show the movement in the original one.

## QR codes and printable labels

**Labels are built** (`/labels`, `src/app/labels/`): one 70×40mm label per bin — the code
in large type, the zone · rack path, the facility name, and a QR code — laid out as a grid
that prints on A4 at true scale (`@media print` in `globals.css` hides the app chrome and
keeps each label whole across page breaks). Scope comes from the query string: nothing =
every bin in the current facility, `?parent=<id>` = every bin nested under a rack or zone
(how labels are applied on the floor — one rack at a time), `?bin=<id>` = just that one.
Entry points are the builder inspector (a bin → "Print label", a rack/zone → "Print bin
labels", nothing selected → "Print all"), and the bin page.

Generated on request with the `qrcode` package as inline SVG, nothing persisted — no blob
storage needed. The QR encodes the bin's URL (`<host>/builder/bin/<id>`, host from
`appBaseUrl()`) rather than the bare code: a phone's stock camera app opens the bin page
directly (logged in → receive/pick right there), and the in-app camera scanner, when it
lands, can take the id off the end of the URL while the printed code stays the typed-code
fallback. In local dev the URL is `localhost`, so a phone can't follow it — it resolves once
deployed under a real host.

**Camera scanning is built** (`src/app/scanner/camera-scanner.tsx`): "Scan label with
camera" on the Scanner page opens a dialog over `getUserMedia` (rear camera preferred) and
decodes frames with the native `BarcodeDetector` where the browser has it (Chrome/Edge —
QR plus the common 1D formats) and `jsQR` on a canvas frame everywhere else (iOS Safari has
no `BarcodeDetector`), at ~7 fps — plenty for a held-up label, and the jsQR path is the
expensive one. A decode goes through `resolveScan()` (`scanner/actions.ts`): a bin-URL QR
becomes the bin's code (refused if the bin belongs to another org; a specific message if
it's one of our *other* facilities), anything else is passed through uppercased. The result
**pre-fills the location field** rather than committing — item and quantity are still the
worker's to confirm, and a torn label falls back to typing into the same field.

`getUserMedia` needs a secure context: https or `localhost`. A phone on the LAN hitting
`http://192.168.x.x:3000` gets a clear in-dialog message rather than a silent failure; test
with `next dev --experimental-https` or against a deployed instance. The camera is released
(tracks stopped) whenever the dialog closes or unmounts.

If item photos are added later, use Cloudflare R2 (zero egress fees) over Azure Blob
(tender-ai's choice, which bills per download — bad fit for something phones fetch
repeatedly).

## Facility levels

`facility_levels` (migration 0008, backfilled: every facility got at least two, or as many as
its tallest rack) is the list of heights a facility's racks may span — index 1..n, optional
name. A rack's `levels` count is how many of those it uses, clamped to the facility's count in
`updateEntity`. `src/lib/levels.ts`: `ensureLevels()` (lazy default of two for anything the
migration didn't cover), `addLevel()`, `renameLevel()`, `removeTopLevel()`. Only the top level
can be removed — deleting one in the middle would renumber every bin above it and every label
already stuck on them — and only when no bin on it holds stock; racks that reached it shrink
by one through the same `reshapeGrid()` the inspector uses. Adding offers to extend every rack
at the current top onto the new level (one new bin per bay, counted against the plan first) or
to add it empty. Bin codes stay numeric (`A-01-2-3`), so renaming a level never touches a
printed label. Builder: the level selector lists the facility's levels (with names) and a ⚙
opens the manage dialog for `editLayout` roles. Tests: `src/tests/facility-levels.test.ts`.

## Blueprint mouse modes

The canvas has three modes (`CanvasMode` in `blueprint-canvas.tsx`), shown as a segmented
control in the toolbar and remembered in `localStorage`: **Navigate** (`H`, or hold `Space` in
any mode) — dragging pans the wrapper's scroll position, the wheel zooms toward the cursor,
objects never react; **Edit** (`V`) — the existing select / move / resize / add / delete; **Inspect**
(`I`) — a click selects and the inspector opens read-only (`fieldset disabled`), nothing moves.
Workers (read-only) get Navigate and Inspect. The wrapper's class (`canvas-mode-*`,
`is-panning`) sets the cursor so the mouse always says what a drag will do.

**Map-only** (`mapOnly = readOnly || viewport < 768px`): the canvas alone — no palette, no
inspector, no undo/grid/levels controls — fitted to the floor on open, Inspect by default so a
tap opens a compact sheet (kind, code, cells, occupancy, "view stock" for a bin, print labels)
above the bottom nav. Editing stays desktop-only (docs/concept.md), so a manager on a phone
sees the same map; a remembered "edit" mode is treated as Inspect there.

Two guard rails in Edit: a drag is armed on mousedown but only becomes live after 4px of
travel, so a click never nudges an object (and a plain click saves nothing); `Esc` drops a
live drag and restores the box. Zoom is `zoomAt(level, clientX, clientY)` — it keeps the floor
point under the cursor fixed by adjusting the wrapper's scroll after the re-render — used by
the ± buttons (centre), the "100%" button, ctrl/⌘+wheel in any mode, plain wheel in Navigate,
and two-finger pinch on touch. One finger pans in Navigate because the wrapper simply scrolls.

## Visual builder — the Depot Blueprint import

Superseded the original "boxes nested inside boxes" drill-down builder: a Claude Design
project (`Depot Blueprint.dc.html`) was imported and re-implemented as a real, spatial 2D
floor-plan canvas — zones/racks/platforms/pallets/bins/docks/walls positioned by `x/y/width/
height` in metres, not a text tree. Brought over from the design: the full visual language
(Barlow/Barlow Condensed, the ink-blue "blueprint" palette in `src/app/ds.css`, hairline
corner-bracket cards), the four-tab structure (Blueprint / Stock / Metrics / Scanner), and
real bay subdivision (a rack with 8 bays becomes 8 actual `locations` rows, not virtual
string keys like the source design used).

Deliberately cut from the source design, to keep this a schema-realistic first pass rather
than a wholesale rebuild:
- **No expiry/shelf-life tracking** — not in `items`/`stock`, a separate feature.
- **Light theme only**, matching the source design exactly (it defines no dark-mode tokens).

Multi-level shelving (`levels`) was cut in the first pass, then added back once the starter
templates needed to represent realistic pallet racking (see below) — a rack in most physical
depots is a metal frame with a ground level and an elevated platform above it at the same x/y
footprint, not a single flat shelf.

### Drag-to-move/resize, and starter templates

Originally shipped numeric-fields-only ("precise metre input suits a blueprint tool"), then
added real mouse drag-to-move and drag-to-resize (a corner handle) alongside — not instead of
— the numeric inspector fields, after direct feedback that non-technical warehouse staff find
typing x/y coordinates unapproachable. Both input methods write through the same
`updateEntity` action, so they can never drift out of sync with each other.

Mechanics: a drag captures the pointer's start position and the entity's starting box once,
in a ref (not React state) at `mousedown` — every subsequent `mousemove` computes the new box
from that fixed origin plus the cursor delta, avoiding the stale-closure bugs that plague
naive drag implementations in React. A snap-to-0.25 m grid keeps positions tidy. Persisting
only fires on `mouseup`, and only if the box actually changed — a plain click starts and ends
a zero-distance "drag," and skipping the no-op save avoids a server round-trip on every single
selection click.

Real correctness gap this exposed: once dragging made moving something between zones a normal
action (not just a rare manual-coordinate edit), `updateEntity` needed to recompute which
zone's bounds a moved entity now falls in and update `parentId` accordingly — otherwise a rack
dragged from Zone A into Zone B would keep reporting to Zone A (wrong parent for occupancy
stats, and wrong cascade target on delete). Zones themselves are exempt — moving a zone
doesn't try to re-home its contents.

**Starter templates** address the "blank canvas is intimidating" half of the same feedback:
`buildTemplate()` in `blueprint-types.ts` generates a small set of entities (positions/sizes
as fractions of the facility's actual width/height, so it fits whatever floor size the user
already configured) for a company to land on and then adjust, rather than starting from
nothing. Applied via the same `createEntityAt` core used for normal manual placement — not a
separate insert path — so a templated zone is indistinguishable from a hand-drawn one. Offered
only on a genuinely empty floor, alongside the palette (never forced) so a confident user can
still just start drawing.

Bug caught by the template feature specifically (not something manual single-entity testing
had ever exercised): `nextCode()`'s sibling-counting used `startsWith(stem)`, which also
matched a sibling rack's own auto-generated bay children (`"A-01-1"` starts with `"A-"` too) —
inflating the count and skipping codes (a zone's second rack came out `"A-08"` instead of
`"A-02"`). Templates create multiple racks in one zone in quick succession, which surfaced it
immediately; fixed by requiring the remainder after the stem to be pure digits.

### "Build from your building": the parametric layout wizard

The fixed starter templates are one drawing each; the pilot customer's ask was that the
template *change based on the building*. `LayoutWizard` (`src/app/builder/layout-wizard.tsx`)
asks five things — floor size (and whether to draw the perimeter), docks (how many, which wall)
and the personnel entrance (wall, position), a column grid (spacing, size), and how the storage
divides (zones, side-by-side or banded, rack levels, bays per rack) — and `buildParametric()`
(`blueprint-types.ts`) generates the depot from the answers. Structure first (walls, docks set
just inside their wall, the door wall-thick, columns at `spacing + n × spacing`), then the zones
in whatever floor is left — pulled back from the dock wall by the docks' depth plus a 1.2 m
staging strip — then racks through `avoidObstacles()` around every fixture, generated or
already on the floor. It is the same `applyGenerated()` pipeline a fixed template goes through
(keep the building, replace the scheme, re-home kept fixtures), just driven by a
`ParametricLayout` instead of a key. `buildDepot()` was refactored onto the same
`zonesInArea()` so the fixed templates and the wizard can't drift apart.

Every step redraws a to-scale SVG preview (`Preview`) with the very function the server runs,
kept structure included, so the counts on the review step are the counts that land. Asking for
3-level racking grows the facility's level list to three (`addLevel`) rather than silently
flattening the racks; a floor-size change is written first so the generator runs against the
new envelope. Server-side the answers are clamped (≤ 12 zones, ≤ 4 levels, ≤ 12 docks, column
spacing ≥ 2 m) and the usual stock guard applies. Offered on the empty floor and at the top of
the Templates dialog; the fixed templates stay below it as the one-click option.

### Openings sit in walls

In every floor-plan editor a door is not a free box — it's a segment of a wall, drawn as an
opening with its swing. Doors, exits and windows (`OPENING_KINDS`) now behave that way:
`snapToWall()` in `blueprint-types.ts` takes an opening's box and the floor's walls and, if the
opening's *near edge* comes within `WALL_SNAP_M` (0.6 m) of a wall's centre line and its
centre falls within the wall's run, returns the settled box — turned to run along the wall
(rotation 0 or 90), set into the wall's thickness, its long side kept as its length and slid so
it never overhangs an end. Measured from the near edge rather than the centre on purpose: a
door still lying the other way is long *across* the wall, so its centre is far from the line
while its edge already touches it, and it would otherwise refuse to snap to a perpendicular
wall. No wall close enough → `null`, and the opening stays a free box exactly where it was
put (a doorway in a partition the user hasn't drawn yet is legitimate).

Applied in three places so the rule can't be dodged: server-side on create
(`createEntityImpl`) and on every move/resize/rotate of an opening (`settleOpening()` in
`updateEntityImpl`), and client-side in `computeDragBox` so the drag preview already shows
where the door will land — the drop holds no surprise. Because a move can turn an opening,
the drag's save sends the whole box plus rotation when width/height changed (openings only;
a rack's resize never touches rotation), and the undo patch carries the original rotation.

Drawing: a `door`/`exit` gets its swing — a quarter arc from the hinge with the leaf standing
open, the classic plan symbol — as one bordered `<span>` with a single rounded corner, sized to
the opening's length, placed on the side facing the floor's centre (the building's inside).
A window keeps its double line; its snapping is the same.

### Column grid, and templates that respect the building

A large building carries its roof on 20–60 columns on a regular structural grid, and racking
has to break at every column line — nobody places those one by one. **"+ Column grid"** in the
palette (`addPillarGrid()` in `actions.ts`, `pillarGridPositions()` in `blueprint-types.ts`)
lays `pillar` fixtures at `offset + n × spacing` over the whole floor or the selected zone;
the dialog previews the exact count with the same function the server runs, positions already
holding a column are skipped (so re-running is idempotent and a denser grid only adds the new
lines), and the whole grid is one undo step. Capped at 200 columns per run.

The other half is that a template must not paper over the building. `applyTemplate()` used to
delete every location; it now deletes only the **scheme** (areas and storage) and keeps every
**fixture** — walls, columns, docks, doors, exits, windows, vents — detaching them from their
zones first (a dock drawn inside zone A has `parentId = A`, and deleting A would cascade to it)
and re-homing them into the new template's zones afterwards. `buildTemplate()` takes the kept
structure as `obstacles`: `avoidObstacles()` cuts any store spec that would overlap one along
its long axis, keeps each piece at the original bay pitch (bays stay realistic instead of
being stretched), and drops pieces too short for two bays rather than leaving stubs — the way
real racking breaks at a column. When walls already exist the template also leaves its own
perimeter walls out, so it never draws a second envelope over a customer's. The
replace-confirmation text says all this in one sentence. Tests: `blueprint-types.test.ts`.

### Rotation in quarter turns, and flipping a rack

Nothing could be rotated: a rack always lay along the x-axis with bay 1 at the left. Pilot
feedback: *"you can't rotate elements horizontally or vertically"*. Free-angle rotation was
considered and rejected — it would break `findContainingZone` (axis-aligned), grid snapping,
the corner resize handle and the bay grid, for a plan that is boxes on a grid by design
(`docs/backlog.md`). Instead, `rotation` (0/90/180/270, `locations.rotation`, migration
`0013`) is the orientation of the **contents** only: the stored box is always the real
axis-aligned footprint, and a quarter turn swaps `widthM`/`heightM` about the box's centre
(`rotateBox()` in `blueprint-types.ts`, snapped and kept on the floor). Containment, snapping,
resizing and every geometry query stay oblivious; only the drawing changes — which way the
bays run and which end bay 1 sits at (`bayLayout()`), and where a rack's end-posts, a pallet's
boards or a door's leaf line go (`kindAppearance(kind, rotation)` in `kind-appearance.ts`,
with an explicit vertical variant for each kind whose drawing has a direction).

**Flip** is a half turn (`flip()`): same footprint, bays counted from the other end. On a
top-down plan that is what "mirror" means for a rack — which end you start counting from — so
it's offered only for multi-bay store kinds. Bin codes never change through a rotate or flip:
`A-01-3` is still the third bay, it just draws at the other end. To make that visible, bay
numbers are drawn in the cells whenever a cell is ≥ 14px on its short side.

Controls: `R` rotates and `F` flips the selection in Edit mode; the inspector's **Orientation**
row shows the current angle with the same two buttons. Both are one `updateEntity` patch
(`rotation`, plus the swapped box for a rotate), so one undo step reverts either. The server
rejects any value other than the four quarter turns. Duplicate and restore carry rotation
along; templates always create at 0°.

### Structural fixtures: door, exit, window, vent, pillar

Only two fixtures existed (`dock`, `wall`), so a floor plan could show where storage was but
not what building it was in. Pilot feedback: *"there's no proper conception of the space
without real elements — entrances, exits, windows, ventilation, and the columns in large
buildings that are part of the structure and take up floor space"* (Optioryx treats obstacles
as first-class map elements for the same reason). Five more `LocationKind`s, all
`spatial: "fixture"`: `door`, `exit` (emergency exit), `window`, `vent`, `pillar`. Fixtures never
hold stock and have no bays/levels; since `kind` is a text column whose enum lives only in
TypeScript, adding them needed **no migration**. Openings default to wall thickness (0.3 m)
so they sit flush in a wall segment; a pillar is 0.5 × 0.5 m.

Drawn in drafting shorthand (`kind-appearance.ts`): door and exit share one drawing — a
wall-thick bar broken by a light dashed centre line — and differ only in colour (green in,
red out), deliberately, since they're the same object and one of them is the one you run for;
a window is the classic double line; a vent a grille of fine louvres; a pillar a cross-hatched
solid section, a step lighter than a wall so the two solids still read apart. Code suffixes:
`DR`, `EX`, `WN`, `V`, `C` (column) — e.g. `A-DR1`, or `P-C3` outside any zone.

Two knock-on changes: the palette is now grouped the way a plan is drawn — **Areas** (zone,
aisle), **Storage** (rack, platform, pallet, bin), **Structure** (wall, pillar, dock, door, exit,
window, vent) — with the legend following the same order; and a fixture smaller than 1 m²
(pillars, vents, windows) hides its on-canvas label unless selected, because a pillar grid or a
run of windows would otherwise drown the plan in 9px labels. The label is still the tooltip and
the inspector title.

### Two-axis subdivision: bays × levels, and the level selector

A "store" location subdivides along two independent axes: `bays` (lateral position — always
existed) and `levels` (vertical/height tier — a rack's ground pallets vs. an elevated metal
platform above them at the same x/y footprint). Both live as explicit integer columns on
`locations`, plus `bay`/`level` on each auto-generated bin child, so a bays/levels resize can
tell "this exact cell already exists, preserve its stock" apart from "this cell is new"
without parsing the display `code` (which a user may have hand-edited) — see `reshapeGrid()`
in `src/app/builder/actions.ts`.

The critical UI constraint: **levels are invisible from a top-down floor plan.** Rendering
them as a second spatial grid axis would visually stretch a rack's real-world footprint,
which is wrong — a rack with 2 levels occupies the same floor rectangle as one with 1. Instead
the canvas toolbar grows a level selector (`ALL` / `1` / `2` / …) whenever any rendered entity
has more than one level; selecting a specific level filters which bay row each multi-level
entity draws (clamped to an entity's own top level if it has fewer), while `ALL` aggregates
occupancy across every level at that bay into one cell. A rack's on-canvas label also appends
its level count (`· 2L`) so the information isn't lost when viewing `ALL`.

Bin codes only spell out the level when there's more than one: `A-01-3` (single-level) vs.
`A-01-2-3` (level 2, bay 3) — see `bayCode()` in `blueprint-types.ts`. Resizing a rack's
levels across the 1 ⇄ >1 boundary renames its surviving children to match the new format,
rather than leaving a mix of old- and new-style codes.

### Full-depot starter templates

The original starter templates (`simple`, `yard`) were a sparse demo — a couple of racks in
one zone. Real feedback was that the default a new company lands on should look like an
actual depot: walled perimeter, multiple zones/sectors separated by aisles, and racks built as
two-level pallet racking by default (see above), not flat one-level shelving. `buildTemplate()`
now offers `depotVertical` and `depotHorizontal` — 4 zones (vertical strips or horizontal
bands, `buildDepot()` in `blueprint-types.ts`), each packed with two-level, 6-bay racks, walled
and aisled — plus `simple` kept as a minimal option for a single small room. All positions
still scale as fractions of the facility's actual configured floor size.

`racksAlongZone()` originally placed a fixed count of 3 rack rows per zone and stretched
whatever space was left over into the gaps between them — on a normal-sized facility that left
a zone many times taller than the racking actually inside it, reading as mostly empty floor
rather than a filled depot. Fixed by deriving the row (or column, for horizontal zones) count
from two real-world constants instead — `RACK_ROW_GAP` (1.8m, a realistic picking-aisle
clearance) and, for horizontal zones, `RACK_BAY_WIDTH` (1.1m, capping how wide a single rack
row is allowed to stretch) — so a zone fills with as many realistically-spaced rows as
actually fit it. A bigger facility now gets more racks per zone rather than emptier aisles: on
the default 40×24m facility this took each zone from 3 racks to 8.

Two more cues address "this doesn't look like a real depot" specifically for the parts that
don't survive a flat top-down projection:
- **Multi-level support posts.** A level is deliberately not drawn as a second spatial axis
  (see above) — but "there's a platform held up above this" still needs *some* on-canvas cue,
  or it's only visible via the small "2L" badge in the label. A `levels > 1` store entity now
  gets four small filled squares at the corners of its own footprint, echoing how architectural
  floor plans show structural columns — the footprint's real corners, not a subdivision of it,
  so it doesn't contradict the "levels aren't spatial" rule.
- **Pallets as the actual unit of storage.** A bay cell's occupied fill used to be a flat block
  of color; it now also gets the same three-deck-board slat pattern as the `pallet` kind itself
  when occupied, so a loaded bay reads as an actual pallet sitting there rather than an
  abstract "has stock" flag. Left off empty cells deliberately, so it reads as "a pallet is
  here" rather than cluttering every open slot.

### One scheme per subscription: persistent access + destructive-replace confirmation

Templates were originally offered once, on a genuinely empty floor. Once a facility can have
real stock committed to it, silently offering "start over" at any time is dangerous — a
misclick could discard a working layout. Two changes: a **Templates** button now lives
permanently in the builder sidebar (not just on an empty floor), and `applyTemplate()` takes an
explicit `replace: boolean` — calling it against a floor that already has locations without
`replace: true` throws a translated `confirmationRequired` error, which the client turns into a
confirmation dialog spelling out the actual constraint (a subscription gives one depot scheme;
replacing it discards the current one and can't be undone, though blank/other templates remain
always available). Confirming re-calls with `replace: true`. Either way, `checkNoStock()` still
runs first — a replace is never allowed to silently destroy real stock, confirmed or not; it
fails with `replaceHasStock` and the user has to clear the stock first.

### "Add sector": reflow existing zones to make room

`addSector()` (`src/app/builder/actions.ts`) adds one more top-level zone by shrinking the
existing ones to fit, rather than just dropping a new zone on top of whatever's already there.
`detectOrientation()` looks at whether existing zones are laid out more spread out
horizontally or vertically (comparing the spread of their centre-point coordinates), and
`computeZoneSlots()` computes N+1 evenly-sized boxes along that same axis. Each existing zone
is resized to its new slot, and `rescaleWithinZone()` applies the same affine transform (scale
+ offset, derived from old vs. new zone bounds) to reposition its direct children so racks
keep their relative position inside a now-narrower zone instead of spilling outside it.

Deliberately scoped to zones and their own direct children — an aisle or dock placed
independently of any zone is left where it is rather than attempting a full general-purpose
layout engine that reflows the whole floor. The new zone itself is created empty; a user fills
it from the palette like any other zone.

## Notifications — one channel for feedback

`src/components/notifications/`: a `NotificationsProvider` mounted once in the root layout,
`useNotify()` for toasts (`success/error/warning/info`, plus `notify.run(fn, { success })`, which
awaits a server action and turns the `UserError` message that `unwrap()` rethrows — permission,
plan limit, lockout, validation — into an error toast with no per-feature code) and
`useConfirm()` for a promise-based dialog (`danger` variant; an `input` option that replaces
`window.prompt`). The browser's own `alert/confirm/prompt` are banned — `src/tests/
no-browser-dialogs.test.ts` greps `src/` and fails the suite if one comes back.

Behaviour: success/info dismiss themselves, warnings a little later, errors stay until closed;
hover pauses the timer; at most three stack; `role="alert"` for errors, `aria-live` otherwise.
Desktop stacks top-right; under 600px the toaster is full-width at the bottom above the safe
area. Styles live in `ds.css` next to the new status tokens (`--color-success-*` — the depot
green the landing page shares — `--color-warning-*`, `--color-danger-*`, `.btn-danger`).

Inline messages remain only for field-level validation, through one `<FormError>` component
(`src/components/form-error.tsx`); outcomes — booked, saved, added, blocked — go through toasts.
The camera dialog keeps its in-viewport status text because it explains the black rectangle
the user is looking at.

## Contact form

`/contact` has a form (`src/app/contact/contact-form.tsx` → `sendContactMessage` in `actions.ts`).
Each message is stored in `contact_messages` (migration 0007) and emailed to the support address
through `sendEmail()` with the sender as `reply-to`, so answering is a plain reply; `sent_at` marks
delivery, and a send failure keeps the row (the message isn't lost, it's just not in the inbox yet)
and tells the user so. Anti-spam is deliberately boring and external-service-free: a honeypot
field, a minimum fill time of two seconds, and a per-IP cap of five messages an hour counted from
the same table — bots are accepted silently and dropped, never shown an error to learn from.
Signed-in users get name and email prefilled. Feedback goes through the notification system.

## Landing page

`/` (`src/app/page.tsx`) shows the product instead of describing it. Two grounds carry the
page: the app's off-white, and the ink blue (`--color-accent-900`) for the hero band and the
closing band — the blueprint demo sits on it like a drawing on a drafting table. One accent
throughout; the green ramp is reserved for success toasts (a green variant was tried and
rejected, 2026-09-19). The hero
also carries four true numbers (2 s lookup, 0 devices, 70×40 mm labels, 30-day trial); a "who
it's for" strip names six concrete depot types instead of logos or testimonials. The hero is the core loop
running live — `src/app/landing/demo-blueprint.tsx`, a hand-drawn demo depot (three racks,
a pallet row, a dock, drawn with the builder's own kind styles) and a search box over a
five-item catalog; a match lights the bin with the same `locate-ping` the real search uses.
It cycles through the catalog on its own until the visitor types. The "how it works" strip
reuses real UI: a rack as the builder draws it, a label exactly as `/labels` prints it (real
QR, generated server-side), and the scanner form's silhouette. Pricing is `PlanCards`
(`src/components/plan-cards.tsx`), the same component `/pricing` renders from the `plans`
table, so the two can't drift. Copy is in `messages/*.json` under `home`, written for a
depot in Kosovo rather than a generic SMB — a worker's phone, no hardware, prepaid in euro,
one person building it — and it stays honest to what's shipped: nothing promised that the
product doesn't do today. No screenshots as images: everything on the page is markup, so it
stays current when the design system changes and weighs nothing.

## Search and share metadata

`src/lib/seo.ts` builds it; all copy is under `meta` in `messages/*.json`, so Albanian pages
carry Albanian titles and descriptions ("menaxhim depoje", "program magazine" — what the primary
market types into Google) and English pages English. The root layout's `generateMetadata` sets
the site title/template, description, keywords, Open Graph and Twitter cards; each public page
adds its own title, description and canonical via `pageMetadata(key, path)`; the home page uses
the brand-first absolute title. `src/app/opengraph-image.tsx` renders the share card on request
with `next/og` in the page's language (no image file to keep in sync); `icon.png` /
`apple-icon.png` are the square logo. The landing page embeds JSON-LD (`Organization` +
`SoftwareApplication` with the live plan prices as offers). Token pages (`/invite/*`,
`/reset-password/*`, `/verify-email/*`) are `noindex`.

`src/app/robots.ts` and `sitemap.ts` derive the host from the request like email links do.
The URL space is classified once in `src/lib/routes.ts` — public paths, protected prefixes —
and the middleware only redirects *protected* paths to `/login`; anything unknown falls through
to `not-found.tsx`, so a mistyped URL (or a crawler's `robots.txt` fetch) no longer lands on the
login form. `src/tests/routes.test.ts` fails if a directory under `src/app` isn't classified, which
is what keeps "new routes are protected" true without protect-by-default.

**Locale in the URL, public pages only.** `src/lib/locale-path.ts`: `/pricing` is Albanian (the
default, no prefix), `/en/pricing` English. The middleware rewrites `/en/<public path>` to the
unprefixed route with an `x-locale` header that `src/i18n/request.ts` reads ahead of the cookie,
and sets the cookie so the app behind the login follows; a public path reached without a prefix
while the cookie says English redirects to its `/en` twin, so English content has exactly one URL
(what canonical/hreflang promise — crawlers carry no cookie, so `/` is always Albanian for them).
`/en/<app page>` just drops the prefix; the app stays cookie-only. `pageMetadata()` emits the
language-specific canonical plus `hreflang` sq/en/x-default; the sitemap lists both versions of
every page with alternates. `PublicLink` (client) prefixes hrefs on public pages; the locale
switcher navigates to the sibling URL there and refreshes elsewhere. `src/lib/locale-path.test.ts`
covers the prefix parsing.

## Internationalization

**next-intl**, cookie-based (`NEXT_LOCALE`), no URL locale prefixes — this is a logged-in
tool, not a public site needing per-locale SEO, so `/sq/...` / `/en/...` routing would be
pure overhead. Default locale is **Albanian** (`sq`), the primary target market, with English
as the switch-to option via a header toggle. Messages live in `messages/en.json` and
`messages/sq.json`, organized by page/feature namespace.

Every static UI string and every user-facing server-action error/validation message is
translated (the latter via `getTranslations()` called server-side, so a thrown `Error`'s
`.message` is already in the caller's locale by the time the client displays it — no
client-side error-code mapping needed). Not translated, deliberately: anything the user
themselves typed (item names, location codes, facility names) — only the app's own chrome.

One deliberate design choice: a new location's auto-generated default `name` (e.g. "ZONË" vs
"ZONE") is resolved in the *creating user's current locale* and then stored as a normal
editable field — so it's immediately usable without the admin having to rename every object,
but it does **not** retroactively change if they later switch languages (same as any other
user-entered text). Location **codes** (e.g. `A-01`) are deliberately generated from a fixed,
locale-independent scheme regardless of UI language, since they're operational identifiers
that need to stay stable and predictable, not translated labels.

No canvas/diagramming library (Konva, React Flow, etc.) — plain absolutely-positioned React
elements are enough for boxes-on-a-grid and keep bundle size down.

### Per-kind visual language

Every entity kind originally rendered as one of three generic looks (dashed area, hatched
fixture, plain white store box) — differentiated mostly by size, which meant the floor plan
didn't actually read as a depot to someone who wasn't already staring at the codes. Fixed by
giving each `LocationKind` its own look in `KIND_APPEARANCE` (`blueprint-canvas.tsx`), styled
after architectural drafting conventions rather than literal icons: racks get a light tint
with heavy end-posts (the steel uprights a real pallet rack bolts to), platforms a fine
crosshatch (a grated deck), pallets three horizontal bars (the classic top-down pallet
silhouette), bins a nested inset border (a container in its slot), docks an accent-tinted
hatch distinct from a wall's neutral one, and walls a solid dark poché fill — the one kind
that's genuinely impassable, so it's the one drawn solid instead of hollow. All CSS
(`repeating-linear-gradient`/`linear-gradient` background patterns, no images), so it costs
nothing extra to render and needs no new dependency. The same table drives the palette
swatches, so the palette doubles as a legend a new user learns while placing objects.

**One colour per kind, and a legend.** The patterns alone weren't enough: every kind sat on
the same accent-blue ramp, and a pilot customer's verdict was "dock, bin… they all look the
same". Each kind now owns a hue (`--kind-*` tokens in `ds.css`; `KIND_COLOR` in
`src/app/builder/kind-appearance.ts`, which also now holds `KIND_APPEARANCE` so the canvas,
palette, legend and the landing-page demo all draw from one table): zone keeps the structural
blue and aisle goes neutral — areas stay quiet — while storage and fixtures carry the colour
(rack indigo, platform violet, pallet timber, bin teal, dock orange, wall near-black). Picked to
stay apart under deuteranopia; the hatch patterns are kept so a greyscale print still tells them
apart. An object's on-canvas label is set in a dark shade of its kind's colour
(`kindLabelColor()`), and the "stocked" fill of a bay cell deliberately stays the one accent
colour across every kind — "has stock" is a single signal, not a per-kind one.

A floating **legend** (bottom-left of the canvas, toggled from the toolbar, remembered in
`localStorage`) lists the kinds actually present on the floor with swatch, name and count. It
exists mainly for the viewers who never see the palette — workers and the phone map — since for
an editor the palette already is the legend; the inspector's composition rows gained the same
swatches for the same reason. On the phone it clears the bottom nav the way `.map-sheet` does
(`.canvas-legend` in `globals.css`) and hides while the tap sheet is up, so the two never stack.

One follow-on fix this surfaced: a subdivided rack/platform's bay-grid cells painted opaque
white, which fully hid the kind's own pattern in exactly the case (multi-bay racks) where it
mattered most. Unoccupied bay cells now use a translucent wash instead of solid white so the
parent's pattern still reads through the grid; occupied cells stay opaque (`--color-accent-
200`) so "has stock" remains unambiguous at a glance.

### Search-to-highlight

The gap this closed: stock search results used to link to a text-only `/builder/bin/[id]`
page — a worker searching an item got a location *code* back, not a place on the floor plan
they'd actually recognize. Search results (`stock-search.tsx`) now link to `/builder?bin=<id>`
as their primary action; `/builder/bin/[id]` (stock add/remove) is still one tap away via a
secondary "Manage stock" link on the same result, so nothing already built was displaced.

`BlueprintCanvas` accepts `initialHighlightBinId` and, on load, walks the bin up to its
rendering parent (the rack/platform box the canvas actually draws — a bin itself is usually a
grid cell, not its own box), selects that parent, switches the level selector to the bin's
own level if it has more than one, scrolls the parent into view, and flashes the exact bay
cell for a few seconds — then drops the `?bin=` param via `router.replace` so a refresh
doesn't replay it. The flash (`.locate-ping` in `ds.css`) animates `transform`/`filter`
specifically because every other visual property (border, background, box-shadow, outline) is
already claimed by a box's own inline kind styling or selection ring, and inline style always
wins over a class.

Real bug this exposed, not from the design but from React's dev-only Strict Mode: the
highlight effect scheduled its "clear the flash" timer and marked itself consumed in the same
synchronous pass. Strict Mode double-invokes effects once on mount (mount → cleanup → mount)
to surface exactly this kind of bug — the first mount's cleanup canceled the timer, but since
the "consumed" flag had already flipped, the second (real) mount saw nothing to do and never
rescheduled it, leaving the flash stuck on permanently in development. Fixed by only marking
the highlight consumed *inside* the timer callback once it actually fires, not synchronously
in the effect body — both Strict Mode passes now schedule fresh timers safely, and once one
of them actually completes, later unrelated reloads correctly stop re-triggering the highlight.

### Undo/redo, copy/paste, delete

A client-side stack of inverse-operation pairs (`undo`/`redo` thunks), not a snapshot/restore
system — each pair is built from the same server actions the UI already calls, so it only
covers operations where "undo" has an unambiguous, safe meaning: create, delete, duplicate,
paste, move, resize, and field edits (name/code/dimensions/bays/levels) on one entity at a
time. `applyTemplate` and `addSector` touch many rows in one call and already carry their own
confirmation gate (or, for templates, an explicit "not reversible" warning) — rather than try
to make a many-row operation safely revertible, they simply clear undo/redo history, so a
stale entry never tries to patch a floor template-replace already rearranged.

Create/delete/duplicate/paste all make a *row* appear or disappear, and the server action
always mints a fresh id — so each of those undo entries closes over a mutable `liveId` that
gets reassigned every time the entry's own `undo`/`redo` runs, letting one entry keep
correctly referring to "this logical entity" across repeated undo/redo cycles even as its
underlying database id changes each time. Undoing a delete needed a way to recreate an entity
with its *exact* prior kind/box/bays/levels — not a kind's defaults, the same mistake
`duplicateEntity` had before this session's earlier fix — so `restoreEntity` was added as a
thin public wrapper around the same internal `createEntityAt` both `createEntity` and
`duplicateEntity` already use.

Keyboard handling lives in one `window` `keydown` listener, gated so it only fires when focus
isn't inside a text/number input or textarea (preserving native undo/copy/paste inside form
fields) and no dialog is open. Cmd/Ctrl+Z undoes, Shift adds redo (Cmd/Ctrl+Y also redoes);
Cmd/Ctrl+C copies the selected entity's id into an in-memory clipboard (not the system
clipboard — deliberately, so paste doesn't require Clipboard API permissions) unless there's
an active text selection on the page, in which case native text-copy is left alone; Cmd/Ctrl+V
pastes via the existing `duplicateEntity` action, cascading each repeated paste from the
previous one rather than always offsetting from the original; Delete/Backspace removes the
current selection. Small Undo/Redo buttons in the canvas toolbar mirror the shortcuts for
anyone not on a keyboard shortcut-friendly device.

### Resizable palette/inspector panels

The builder's three-column layout (palette, canvas, inspector) was fixed-width — reasonable
for the default sizes, but a fixed 214px palette or 306px inspector can crowd a workflow that
wants more canvas, or cramp one that wants to read longer labels. Both side panels are now
user-resizable: a 6px drag handle (`.resize-handle` in `ds.css`, a hairline by default,
highlighting on hover/drag) sits between each sidebar and the canvas, dragging updates the
grid's `gridTemplateColumns` directly (`${leftWidth}px 6px minmax(360px,1fr) 6px
${rightWidth}px`), and the chosen widths persist to `localStorage` so they survive a reload.
Clamped to a sane range per side (160–420px palette, 220–480px inspector) so a drag can't
crush a panel unusably small or swallow the whole canvas.

Persisted widths are applied in a `useEffect` after mount, not read into the initial
`useState`, even though that means a one-frame flash from default to saved width on load —
reading `localStorage` during the very first render would make that render diverge from what
the server sent (which has no access to the browser's storage) and trip a hydration mismatch.

### Dev-only stale-translations trap

`src/i18n/request.ts` originally loaded messages via `import(`../../messages/${locale}.json`)`
— a dynamic import behind a template string. Turbopack's dev server doesn't reliably
invalidate that particular pattern when the JSON file changes; new keys can throw
`MISSING_MESSAGE` in the browser for a running dev session even though the file on disk is
correct, until the dev server is restarted. Hit this twice in one session before tracing it to
the import style rather than the file content. Fixed by switching to static imports for both
locales (`en`/`sq`) into a small lookup object — an ordinary part of the module graph, so it
hot-reloads like any other source edit instead of needing a manual restart.

## Background jobs

None for MVP. No AI calls, no heavy async processing yet — a queue (pg-boss, used in
tender-ai) is a cost/complexity to add only once something concrete needs it.

## Hosting

| Service | Choice | Cost |
|---|---|---|
| App (Next.js) | Render Web Service, Starter — git-push deploys, always-on, no Dockerfile required | $7/mo |
| Database | Render Postgres, Starter — same dashboard/bill, automatic daily backups | $6/mo |
| Domain | Any registrar | ~$1/mo amortized |
| TLS | Automatic (Render) | $0 |
| Errors | Sentry free tier (5k events/mo) | $0 |
| **Total** | | **~$14/mo flat** |

`render.yaml` at the repo root is this table as a Render Blueprint. Its one non-obvious line is
`preDeployCommand: pnpm db:migrate` — Drizzle migrations run against the live database before
the new build takes traffic, and a failing migration aborts the deploy rather than shipping code
that expects columns that don't exist yet. Nothing else runs migrations: Docker Compose is local
Postgres only, and `pnpm db:push` is a dev-only shortcut that can't do backfills (migration 0004
needed one). Secrets (`RESEND_API_KEY`, `PAYSERA_*`, …) are `sync: false` — set in the dashboard,
never in the file; `AUTH_SECRET` is generated by Render on first deploy.

### Vercel as the interim host (until there's a domain)

Paysera won't approve a Checkout project it can't open, and there was no domain yet — a free
`*.vercel.app` URL gets the review unblocked now, and the Render plan above stays the target once
a domain exists (the reasons there — no cold starts, one bill — still hold). Two things had to
change to build on Vercel at all, and both are improvements regardless of host:

- `src/db/index.ts` connects **lazily** — `next build` imports every route module on a machine
  with no `DATABASE_URL`, and the client used to throw at import. Now nothing touches Postgres
  until the first query. `prepare: false` because pooled serverless Postgres (Neon) doesn't
  support named prepared statements across connections.
- `src/auth.config.ts` is the database-free half of the Auth.js setup. `middleware.ts` runs on
  Vercel's Edge runtime, where the Postgres driver can't load; it only needs to decode the JWT
  cookie, so it builds its own `NextAuth(authConfig)` without the Credentials provider. `auth.ts`
  spreads the same config and adds the provider for pages and server actions.

`vercel.json` runs `pnpm db:migrate` as part of the build command — the Vercel equivalent of
Render's pre-deploy step; a failing migration fails the build. **Only when `VERCEL_ENV` is
`production`**: preview builds of a PR branch share the production `DATABASE_URL`, and one of
them once applied a half-written migration to the live database (#68). Never rewrite a
migration file after it has been pushed; add a new one.

**Where things stand (2026-09-18).** Production is `https://depo-zeta.vercel.app` — Vercel
Hobby, Neon free Postgres, `fra1`, deploying from `main` on every merge. Env vars, migrations,
plan seeding and the full signup → verify → builder → stock → Paysera test-payment path are
done and verified there. `render.yaml` is *not* read by Vercel: every value in it, including
the Gmail SMTP block (`SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`EMAIL_FROM`, plus the secret
`SMTP_PASS`), has to be entered by hand under Vercel → Project → Settings → Environment
Variables, then redeployed. Until `SMTP_PASS` is set there, production mail still goes
through whatever `RESEND_API_KEY` is configured — or the console log.

What's left before the first paying customer, in order:

1. **Domain.** Buy one at any registrar, add it under Vercel → Domains, point the registrar's
   DNS at Vercel (one CNAME / A record, shown in that screen); TLS is automatic. Every
   printed bin label's QR encodes the host it was printed from (`appBaseUrl()`), so print
   real labels only *after* the domain is live — labels printed from `depo-zeta.vercel.app`
   would stop resolving if that URL ever goes away.
2. **Hosting tier — decided 2026-09-18: stay on Vercel + Neon, upgrade both.** Vercel Pro
   (1 seat, $20/mo, commercial use) and Neon Launch with autosuspend *disabled* at 0.25 CU
   (~$19–22/mo) — about $45/mo all-in, flat to ~50 customers and to ~100 before Neon needs
   0.5 CU. Chosen over the Render blueprint (~$14/mo) because nothing that works has to move;
   the difference is ~€25/mo. Neon free tier suspends after 5 min idle, so until the upgrade a
   first request can take seconds. Two things to check when upgrading: `DATABASE_URL` in Vercel
   must be Neon's *pooled* endpoint (`-pooler`), and Launch gives 7-day point-in-time restore —
   add an off-Neon weekly `pg_dump` before the customer base is worth losing.
3. **Email domain.** Once the domain exists, verify it at Resend and set `EMAIL_FROM` to an
   address on it; SMTP via Gmail is the bridge until then.

### Why Render over the alternatives considered
- **Vercel Hobby + Neon/Supabase free:** $0/mo, but Hobby tier's terms expect commercial
  projects to upgrade to Pro ($20/mo), and free-tier Postgres can cold-start/pause —
  directly undermines the product's core promise of an instant answer for a worker on the
  floor, especially bad if it happens during a pilot-customer demo.
- **Self-hosted VPS (Hetzner, ~$5/mo):** cheapest option and reuses tender-ai's Docker
  Compose pattern, but requires self-managed backups/OS updates. Ruled out per explicit
  preference: pay a bit more, avoid server maintenance.
- **Railway/Fly.io:** usage-based billing — can be cheaper at near-zero traffic, but harder to
  predict as real usage shows up, which is the exact surprise-bill risk being avoided here.
- **Render (chosen):** flat per-service pricing, always-on (no cold starts), managed backups,
  automatic TLS, commercial use is fine on paid tiers, single dashboard/bill for app + DB.

### Decision log (locked in)
- One Next.js app, not three — no separate API/admin service
- Postgres + adjacency-list tree + Drizzle
- Auth.js, not Keycloak
- On-demand QR generation, no blob/object storage for MVP
- Plain React for the visual builder, no canvas library
- No background job queue for MVP
- Hosting: Render (app + Postgres), ~$14/mo flat, chosen over self-hosted VPS because the
  user prefers managed/no server maintenance and is willing to pay a bit more for it
