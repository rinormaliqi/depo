import { test, expect, accounts, PASSWORD } from "./helpers/fixtures";
import { signIn } from "./helpers/fixtures";

// Nothing here may leave a seeded account in a state later specs can't sign
// into, so the password cases only exercise refusals.
test.describe("account settings", () => {
  test("a new display name is saved and survives a reload", async ({ page }) => {
    await signIn(page, accounts.trialAdmin);
    await page.goto("/account");
    const name = page.locator("#acc-name");
    const original = await name.inputValue();
    const renamed = `${original} ${Date.now() % 1000}`;
    await name.fill(renamed);
    await page.getByRole("button", { name: /ruaj|save/i }).first().click();
    await page.waitForTimeout(1500);
    await page.reload();
    await expect(page.locator("#acc-name")).toHaveValue(renamed);

    await name.fill(original);
    await page.getByRole("button", { name: /ruaj|save/i }).first().click();
    await page.waitForTimeout(1000);
  });

  test("the save button stays disabled until the name actually changes", async ({ page }) => {
    await signIn(page, accounts.trialWorker);
    await page.goto("/account");
    await expect(page.getByRole("button", { name: /ruaj|save/i }).first()).toBeDisabled();
  });

  test("a wrong current password is refused and the old one still works", async ({ page }) => {
    await signIn(page, accounts.enterpriseWorker);
    await page.goto("/account");
    await page.locator("#acc-current").fill("not-the-password");
    await page.locator("#acc-next").fill("BrandNew123!");
    await page.locator("#acc-next2").fill("BrandNew123!");
    await page.getByRole("button", { name: /ndrysho|vendos|change|set/i }).first().click();
    await page.waitForTimeout(2000);

    // The real proof: the original password still signs in.
    await page.context().clearCookies();
    await signIn(page, accounts.enterpriseWorker);
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("mismatched new passwords are refused", async ({ page }) => {
    await signIn(page, accounts.enterpriseWorker);
    await page.goto("/account");
    await page.locator("#acc-current").fill(PASSWORD);
    await page.locator("#acc-next").fill("BrandNew123!");
    await page.locator("#acc-next2").fill("DifferentOne123!");
    await page.getByRole("button", { name: /ndrysho|vendos|change|set/i }).first().click();
    await page.waitForTimeout(2000);
    await page.context().clearCookies();
    await signIn(page, accounts.enterpriseWorker);
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("deleting the account demands the email typed out, and cancels cleanly", async ({ page }) => {
    await signIn(page, accounts.trialWorker);
    await page.goto("/account");
    await page.getByRole("button", { name: /fshi llogarinë|delete/i }).first().click();
    const dialog = page.locator("[role=dialog], .modal").first();
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("input")).toBeVisible();
    await dialog.getByRole("button", { name: /anulo|cancel/i }).click();
    await expect(page.locator("#acc-name")).toBeVisible();
  });
});
