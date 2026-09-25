import { test, expect, accounts } from "./helpers/fixtures";

// React 19 resets an uncontrolled <form action={serverAction}> after the
// action resolves — including when it resolved with an error. Every form
// that doesn't feed the submitted values back through `defaultValue`
// therefore empties itself under the user while showing them what to fix.
// React resets an uncontrolled <form action={serverAction}> to its
// defaultValue once the action resolves — errors included — so each action
// hands the submitted values back and the form renders them as defaults.
// That is what makes the reset land on what the person typed.
test.describe("a rejected submit keeps what the user typed", () => {

  test("login keeps the email after a wrong password", async ({ page }) => {
    await page.goto("/login");
    await page.locator("input[name=email]").fill(accounts.paidAdmin.email);
    await page.locator("input[name=password]").fill("definitely-wrong");
    await page.getByRole("button", { name: /kyçu|sign in/i }).click();
    await expect(page.getByText(/i pasaktë|incorrect|invalid/i)).toBeVisible();
    await expect(page.locator("input[name=email]")).toHaveValue(accounts.paidAdmin.email);
  });

  test("signup keeps company, name and email when the email is taken", async ({ page }) => {
    await page.goto("/signup");
    await page.locator("input[name=companyName]").fill("QA Company");
    await page.locator("input[name=name]").fill("QA Person");
    await page.locator("input[name=email]").fill(accounts.paidAdmin.email);
    await page.locator("input[name=password]").fill("Test1234!");
    await page.getByRole("button", { name: /krijo|regjistrohu|create|sign up/i }).click();

    // Wait for the rejection to land first. Asserting straight after the
    // click passes vacuously: the fields still hold their values while the
    // action is in flight, and only empty once it resolves.
    await expect(page.getByText(/ekziston tashmë|already/i)).toBeVisible();
    await expect(page).toHaveURL(/\/signup/);
    await expect(page.locator("input[name=companyName]")).toHaveValue("QA Company");
    await expect(page.locator("input[name=name]")).toHaveValue("QA Person");
    await expect(page.locator("input[name=email]")).toHaveValue(accounts.paidAdmin.email);
  });

  test("adding an item keeps the row when the SKU is taken", async ({ adminPage: page }) => {
    await page.goto("/items");
    const sku = `QA-DUP-${Date.now()}`;
    const fill = async () => {
      await page.locator("input[name=name]").fill("QA retention probe");
      await page.locator("input[name=unitOfMeasure]").fill("copë");
      await page.locator("input[name=sku]").fill(sku);
      await page.locator("input[name=category]").fill("qa");
    };
    await fill();
    await page.getByRole("button", { name: /shto artikull/i }).click();
    await expect(page.getByText(/u shtua/i)).toBeVisible();

    await fill();
    await page.getByRole("button", { name: /shto artikull/i }).click();
    await expect(page.getByText(/përdoret tashmë/i)).toBeVisible();
    await expect(page.locator("input[name=name]")).toHaveValue("QA retention probe");
  });
});
