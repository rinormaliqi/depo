# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: billing-lockout.spec.ts >> an organization whose trial expired without paying >> is told the trial expired, not that the page is for another role
- Location: e2e/billing-lockout.spec.ts:42:3

# Error details

```
Error: expect(locator).not.toContainText(expected) failed

Locator: locator('body')
Expected pattern: not /JO PËR ROLIN TËND/i
Received string: "SMART/DEPODepo Barnash20.0 × 14.0 m · metrik⋯SkemaStokuMetrikaSkaneriLlogariaSQENgent@seed.smartdepo.testDilni!Prova mbaroi. Gjithçka është vetëm-lexim derisa të aktivizohet një plan. Asgjë s'është fshirë.Te FaturimiSkemaStokuMetrikaSkaneriJo për rolin tëndKjo faqe s'është pjesë e punës tënde këtuVetëm menaxherët dhe administratorët mund të shtojnë artikujKthehu te puna ime"
Timeout: 10000ms

Call log:
  - Expect "not toContainText" locator('body') with timeout 10000ms
  - waiting for locator('body')
    24 × locator resolved to <body>…</body>
       - unexpected value "SMART/DEPODepo Barnash20.0 × 14.0 m · metrik⋯SkemaStokuMetrikaSkaneriLlogariaSQENgent@seed.smartdepo.testDilni!Prova mbaroi. Gjithçka është vetëm-lexim derisa të aktivizohet një plan. Asgjë s'është fshirë.Te FaturimiSkemaStokuMetrikaSkaneriJo për rolin tëndKjo faqe s'është pjesë e punës tënde këtuVetëm menaxherët dhe administratorët mund të shtojnë artikujKthehu te puna ime"

```

```yaml
- link "SMART/DEPO":
  - /url: /builder
- text: Depo Barnash 20.0 × 14.0 m · metrik
- link "Skema":
  - /url: /builder
- link "Stoku":
  - /url: /stock
- link "Metrika":
  - /url: /metrics
- link "Skaneri":
  - /url: /scanner
- searchbox "Kërko një artikull, SKU ose vendndodhje"
- link "Llogaria":
  - /url: /account
- button "SQ"
- button "EN"
- text: gent@seed.smartdepo.test
- button "Dilni"
- status:
  - strong: Prova mbaroi.
  - text: Gjithçka është vetëm-lexim derisa të aktivizohet një plan. Asgjë s'është fshirë.
  - link "Te Faturimi":
    - /url: /billing
- main:
  - text: Jo për rolin tënd
  - heading "Kjo faqe s'është pjesë e punës tënde këtu" [level=1]
  - paragraph: Vetëm menaxherët dhe administratorët mund të shtojnë artikuj
  - link "Kthehu te puna ime":
    - /url: /builder
- alert
```

# Test source

```ts
  1  | import { test, expect, accounts } from "./helpers/fixtures";
  2  | import { signIn } from "./helpers/fixtures";
  3  | 
  4  | // The seed gives one organization per billing state (ORGS in
  5  | // src/db/seed-dev.ts). A lockout that doesn't actually stop writes, or one
  6  | // that also blocks the page where you'd pay to lift it, are both serious —
  7  | // so check both directions.
  8  | test.describe("an organization whose trial expired without paying", () => {
  9  |   test.beforeEach(async ({ page }) => {
  10 |     await signIn(page, accounts.lockedTrialAdmin);
  11 |   });
  12 | 
  13 |   test("can still reach billing to pay — the way out is never locked", async ({ page }) => {
  14 |     await page.goto("/billing");
  15 |     await expect(page.locator("body")).toContainText(/plan|faturim|paguaj/i);
  16 |     await expect(page.locator("body")).not.toContainText("JO PËR ROLIN TËND");
  17 |   });
  18 | 
  19 |   test("is told why it is locked", async ({ page }) => {
  20 |     await page.goto("/builder");
  21 |     await expect(page.locator("body")).toContainText(/prov|skad|mbaroi|pagu|blloku/i);
  22 |   });
  23 | 
  24 |   test("cannot add an item while locked", async ({ page }) => {
  25 |     await page.goto("/items");
  26 |     const name = page.locator("input[name=name]");
  27 |     if (await name.count()) {
  28 |       const probe = `Locked probe ${Date.now()}`;
  29 |       await name.fill(probe);
  30 |       await page.locator("input[name=unitOfMeasure]").fill("copë");
  31 |       await page.getByRole("button", { name: /shto artikull/i }).click();
  32 |       await page.waitForTimeout(2000);
  33 |       await expect(page.getByText(probe)).toHaveCount(0);
  34 |     }
  35 |   });
  36 | 
  37 |   // resolveCapabilities() records why a capability is off —
  38 |   // {kind:"role"} | {kind:"plan"} | {kind:"locked"} — but all seven pages
  39 |   // that render <NotForRole capability=…/> throw that away and always print
  40 |   // the role explanation. A locked admin is told the page is not for their
  41 |   // role, directly under a banner saying the trial expired.
  42 |   test("is told the trial expired, not that the page is for another role", async ({ page }) => {
  43 |     test.fail();
  44 |     await page.goto("/items");
> 45 |     await expect(page.locator("body")).not.toContainText(/JO PËR ROLIN TËND/i);
     |                                            ^ Error: expect(locator).not.toContainText(expected) failed
  46 |   });
  47 | 
  48 |   test("cannot move stock while locked", async ({ page }) => {
  49 |     await page.goto("/scanner");
  50 |     const qty = page.locator("input[type=number]");
  51 |     if (await qty.count()) {
  52 |       await qty.fill("1");
  53 |       await page.locator("input[type=text]").last().fill("A-01-1-1");
  54 |       await page.getByRole("button", { name: /regjistro/i }).click();
  55 |       await page.waitForTimeout(2500);
  56 |       // Either refused outright, or the page never offered the control.
  57 |       await expect(page.locator("body")).not.toContainText(/u regjistrua/i);
  58 |     }
  59 |   });
  60 | });
  61 | 
  62 | test.describe("an organization that paid once and lapsed", () => {
  63 |   test("is locked too, and still reaches billing", async ({ page }) => {
  64 |     await signIn(page, accounts.lapsedAdmin);
  65 |     await page.goto("/billing");
  66 |     await expect(page.locator("body")).not.toContainText("JO PËR ROLIN TËND");
  67 |   });
  68 | });
  69 | 
  70 | test.describe("a trial with days left", () => {
  71 |   test("still works and is reminded, not blocked", async ({ page }) => {
  72 |     await signIn(page, accounts.endingTrialAdmin);
  73 |     await page.goto("/items");
  74 |     await expect(page.locator("input[name=name]")).toBeVisible();
  75 |   });
  76 | });
  77 | 
```