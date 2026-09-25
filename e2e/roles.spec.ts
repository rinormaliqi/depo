import { test, expect, accounts } from "./helpers/fixtures";
import { signIn } from "./helpers/fixtures";

// Middleware only separates public from protected (src/lib/routes.ts), so
// role enforcement is each page's own job. These check that a link being
// hidden is backed by the page actually refusing.
test.describe("a worker", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, accounts.paidWorker);
  });

  test("is refused the team page when navigating straight to it", async ({ page }) => {
    await page.goto("/team");
    await expect(page.locator("body")).not.toContainText("FTO NJË KOLEG");
    await expect(page.getByRole("button", { name: /dërgo ftesën/i })).toHaveCount(0);
  });

  test("is refused the billing page when navigating straight to it", async ({ page }) => {
    await page.goto("/billing");
    await expect(page.getByRole("button", { name: /paguaj|blej/i })).toHaveCount(0);
  });

  test("cannot create an item even if the form is on screen", async ({ page }) => {
    await page.goto("/items");
    const form = page.locator("input[name=name]");
    if (await form.count()) {
      await form.fill("Punëtori s'duhet ta shtojë");
      await page.locator("input[name=unitOfMeasure]").fill("copë");
      await page.getByRole("button", { name: /shto artikull/i }).click();
      // Whatever the copy, it must not have been created.
      await page.waitForTimeout(2000);
      await expect(page.getByText("Punëtori s'duhet ta shtojë")).toHaveCount(0);
    }
  });

  test("does not get the builder's edit mode", async ({ page }) => {
    await page.goto("/builder");
    await expect(page.getByRole("button", { name: /^edito$/i })).toHaveCount(0);
  });
});

test.describe("a manager", () => {
  test("runs the warehouse but is kept out of billing", async ({ page }) => {
    await signIn(page, accounts.paidManager);
    await page.goto("/team");
    await expect(page.locator("body")).toContainText(/ekipi|anëtar/i);
    await page.goto("/billing");
    await expect(page.getByRole("button", { name: /paguaj|blej/i })).toHaveCount(0);
  });
});
