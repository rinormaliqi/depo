import { test, expect } from "./helpers/fixtures";

// #215: a found location is marked green on the map and stays marked —
// it used to pulse three times and vanish after 3.6 s.
test.describe("finding an item", () => {
  test("marks the match in the results and keeps the bin green on the map until Esc", async ({ adminPage: page }) => {
    await page.goto("/stock");
    await page.locator("input[type=search]").last().fill("e");
    const first = page.locator(".stock-result").first();
    await expect(first).toBeVisible();
    await expect(first).toHaveClass(/is-top/);
    await expect(page.locator(".search-hit").first()).toBeVisible();

    await first.locator(".stock-result-primary").click();
    await page.waitForURL(/\/builder/);

    const found = page.locator(".is-found");
    await expect(found).toHaveCount(1);
    await expect(page.locator("[aria-current=location]")).toHaveCount(1);
    await expect(page.locator(".found-banner")).toBeVisible();

    // Still there well after the old pulse would have gone.
    await page.waitForTimeout(5000);
    await expect(found).toHaveCount(1);

    await page.keyboard.press("Escape");
    await expect(found).toHaveCount(0);
    await expect(page.locator(".found-banner")).toHaveCount(0);
  });

  test("the banner's × clears it too", async ({ adminPage: page }) => {
    await page.goto("/stock");
    await page.locator("input[type=search]").last().fill("e");
    await page.locator(".stock-result-primary").first().click();
    await page.waitForURL(/\/builder/);
    await expect(page.locator(".is-found")).toHaveCount(1);
    await page.locator(".found-banner button").click();
    await expect(page.locator(".is-found")).toHaveCount(0);
  });
});
