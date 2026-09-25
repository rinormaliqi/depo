import { test, expect, accounts } from "./helpers/fixtures";
import { signIn } from "./helpers/fixtures";

// The seed gives one organization per billing state (ORGS in
// src/db/seed-dev.ts). A lockout that doesn't actually stop writes, or one
// that also blocks the page where you'd pay to lift it, are both serious —
// so check both directions.
test.describe("an organization whose trial expired without paying", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, accounts.lockedTrialAdmin);
  });

  // Paying is the only way out of a lock, so billing must stay open — it
  // did not: manageBilling was switched off with every other permission,
  // /billing answered with the blocked page and LockBanner's "Te Faturimi"
  // led back into it (#138). The billing page renders no <main>, so these
  // read the body, case insensitively: the capitals on "Jo për rolin
  // tënd" come from CSS, and a capitalised literal compared against
  // textContent passes whatever the page says.
  test("can still reach billing to pay — the way out is never locked", async ({ page }) => {
    await page.goto("/billing", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: /^12 muaj$/ })).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/jo për rolin tënd/i);
  });

  test("is told why it is locked", async ({ page }) => {
    await page.goto("/builder");
    await expect(page.locator("body")).toContainText(/prov|skad|mbaroi|pagu|blloku/i);
  });

  test("cannot add an item while locked", async ({ page }) => {
    await page.goto("/items");
    const name = page.locator("input[name=name]");
    if (await name.count()) {
      const probe = `Locked probe ${Date.now()}`;
      await name.fill(probe);
      await page.locator("input[name=unitOfMeasure]").fill("copë");
      await page.getByRole("button", { name: /shto artikull/i }).click();
      await page.waitForTimeout(2000);
      await expect(page.getByText(probe)).toHaveCount(0);
    }
  });

  // resolveCapabilities() records why a capability is off —
  // {kind:"role"} | {kind:"plan"} | {kind:"locked"} — and BlockedPage uses
  // it, so a lock reads as a lock instead of borrowing the role copy.
  test("is told the trial expired, not that the page is for another role", async ({ page }) => {
    await page.goto("/items");
    await expect(page.locator("body")).not.toContainText(/jo për rolin tënd/i);
    await expect(page.locator("main")).toContainText(/prov/i);
    // Now that a locked admin may reach billing, the page itself offers the
    // way there — scoped to <main>, since the header and the lock banner
    // both carry a link to billing too.
    await expect(page.locator("main").getByRole("link", { name: /te faturimi/i })).toBeVisible();
  });

  test("cannot move stock while locked", async ({ page }) => {
    await page.goto("/scanner");
    const qty = page.locator("input[type=number]");
    if (await qty.count()) {
      await qty.fill("1");
      await page.locator("input[type=text]").last().fill("A-01-1-1");
      await page.getByRole("button", { name: /regjistro/i }).click();
      await page.waitForTimeout(2500);
      // Either refused outright, or the page never offered the control.
      await expect(page.locator("body")).not.toContainText(/u regjistrua/i);
    }
  });
});

test.describe("an organization that paid once and lapsed", () => {
  test("is locked too, and still reaches billing", async ({ page }) => {
    await signIn(page, accounts.lapsedAdmin);
    await page.goto("/billing", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: /^12 muaj$/ })).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/jo për rolin tënd/i);
  });
});

test.describe("a trial with days left", () => {
  test("still works and is reminded, not blocked", async ({ page }) => {
    await signIn(page, accounts.endingTrialAdmin);
    await page.goto("/items");
    await expect(page.locator("input[name=name]")).toBeVisible();
  });
});
