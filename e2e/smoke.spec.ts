import { test, expect, accounts } from "./helpers/fixtures";
import { signIn } from "./helpers/fixtures";

test.describe("public pages", () => {
  test("the landing page renders and switches to English", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/SmartDepo/i);
    await page.getByRole("button", { name: /^EN$/ }).click();
    await page.waitForURL(/\/en$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  test("English lives at its own prefixed URL", async ({ page }) => {
    await page.goto("/en");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  test("a protected page sends an anonymous visitor to the login", async ({ page }) => {
    await page.goto("/items");
    await page.waitForURL(/\/login/);
    await expect(page.locator("input[name=email]")).toBeVisible();
  });
});

test.describe("sign in", () => {
  test("wrong password is refused and says so", async ({ page }) => {
    await page.goto("/login");
    await page.locator("input[name=email]").fill(accounts.paidAdmin.email);
    await page.locator("input[name=password]").fill("wrong-password");
    await page.getByRole("button", { name: /kyçu|sign in/i }).click();
    await expect(page.getByText(/i pasaktë|incorrect|invalid/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("an admin signs in and lands inside the app", async ({ page }) => {
    await signIn(page, accounts.paidAdmin);
    await expect(page).not.toHaveURL(/\/login/);
  });
});

test.describe("the signed-in shell", () => {
  const pages = ["/builder", "/items", "/stock", "/labels", "/team", "/metrics", "/account", "/billing", "/scanner"];
  for (const path of pages) {
    test(`${path} loads without a client-side error`, async ({ adminPage }) => {
      const errors: string[] = [];
      adminPage.on("pageerror", (e) => errors.push(e.message));
      const response = await adminPage.goto(path);
      expect(response?.status(), `${path} HTTP status`).toBeLessThan(400);
      await expect(adminPage).not.toHaveURL(/\/login/);
      expect(errors, `${path} console errors`).toEqual([]);
    });
  }
});
