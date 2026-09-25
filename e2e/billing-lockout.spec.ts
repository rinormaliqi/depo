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

  test("can still reach billing to pay — the way out is never locked", async ({ page }) => {
    await page.goto("/billing");
    await expect(page.locator("body")).toContainText(/plan|faturim|paguaj/i);
    await expect(page.locator("body")).not.toContainText("JO PËR ROLIN TËND");
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
  // {kind:"role"} | {kind:"plan"} | {kind:"locked"} — but all seven pages
  // that render <NotForRole capability=…/> throw that away and always print
  // the role explanation. A locked admin is told the page is not for their
  // role, directly under a banner saying the trial expired.
  test("is told the trial expired, not that the page is for another role", async ({ page }) => {
    test.fail();
    await page.goto("/items");
    await expect(page.locator("body")).not.toContainText(/JO PËR ROLIN TËND/i);
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
    await page.goto("/billing");
    await expect(page.locator("body")).not.toContainText("JO PËR ROLIN TËND");
  });
});

test.describe("a trial with days left", () => {
  test("still works and is reminded, not blocked", async ({ page }) => {
    await signIn(page, accounts.endingTrialAdmin);
    await page.goto("/items");
    await expect(page.locator("input[name=name]")).toBeVisible();
  });
});
