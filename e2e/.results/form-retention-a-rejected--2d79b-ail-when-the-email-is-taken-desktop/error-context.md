# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: form-retention.spec.ts >> a rejected submit keeps what the user typed >> signup keeps company, name and email when the email is taken
- Location: e2e/form-retention.spec.ts:22:3

# Error details

```
Error: expect(locator).toHaveValue(expected) failed

Locator:  locator('input[name=companyName]')
Expected: "QA Company"
Received: ""
Timeout:  10000ms

Call log:
  - Expect "toHaveValue" locator('input[name=companyName]') with timeout 10000ms
  - waiting for locator('input[name=companyName]')
    24 × locator resolved to <input required="" class="input" name="companyName" placeholder="Depo Rinia"/>
       - unexpected value ""

```

```yaml
- textbox "Depo Rinia"
```

# Test source

```ts
  1  | import { test, expect, accounts } from "./helpers/fixtures";
  2  | 
  3  | // React 19 resets an uncontrolled <form action={serverAction}> after the
  4  | // action resolves — including when it resolved with an error. Every form
  5  | // that doesn't feed the submitted values back through `defaultValue`
  6  | // therefore empties itself under the user while showing them what to fix.
  7  | // Expected failures until the forms feed submitted values back through
  8  | // `defaultValue`. They flip to passing the moment that lands, which is the
  9  | // point: remove the test.fail() line with the fix.
  10 | test.describe("a rejected submit keeps what the user typed", () => {
  11 |   test.fail();
  12 | 
  13 |   test("login keeps the email after a wrong password", async ({ page }) => {
  14 |     await page.goto("/login");
  15 |     await page.locator("input[name=email]").fill(accounts.paidAdmin.email);
  16 |     await page.locator("input[name=password]").fill("definitely-wrong");
  17 |     await page.getByRole("button", { name: /kyçu|sign in/i }).click();
  18 |     await expect(page.getByText(/i pasaktë|incorrect|invalid/i)).toBeVisible();
  19 |     await expect(page.locator("input[name=email]")).toHaveValue(accounts.paidAdmin.email);
  20 |   });
  21 | 
  22 |   test("signup keeps company, name and email when the email is taken", async ({ page }) => {
  23 |     await page.goto("/signup");
  24 |     await page.locator("input[name=companyName]").fill("QA Company");
  25 |     await page.locator("input[name=name]").fill("QA Person");
  26 |     await page.locator("input[name=email]").fill(accounts.paidAdmin.email);
  27 |     await page.locator("input[name=password]").fill("Test1234!");
  28 |     await page.getByRole("button", { name: /krijo|regjistrohu|create|sign up/i }).click();
  29 | 
  30 |     // Wait for the rejection to land first. Asserting straight after the
  31 |     // click passes vacuously: the fields still hold their values while the
  32 |     // action is in flight, and only empty once it resolves.
  33 |     await expect(page.getByText(/ekziston tashmë|already/i)).toBeVisible();
  34 |     await expect(page).toHaveURL(/\/signup/);
> 35 |     await expect(page.locator("input[name=companyName]")).toHaveValue("QA Company");
     |                                                           ^ Error: expect(locator).toHaveValue(expected) failed
  36 |     await expect(page.locator("input[name=name]")).toHaveValue("QA Person");
  37 |     await expect(page.locator("input[name=email]")).toHaveValue(accounts.paidAdmin.email);
  38 |   });
  39 | 
  40 |   test("adding an item keeps the row when the SKU is taken", async ({ adminPage: page }) => {
  41 |     await page.goto("/items");
  42 |     const sku = `QA-DUP-${Date.now()}`;
  43 |     const fill = async () => {
  44 |       await page.locator("input[name=name]").fill("QA retention probe");
  45 |       await page.locator("input[name=unitOfMeasure]").fill("copë");
  46 |       await page.locator("input[name=sku]").fill(sku);
  47 |       await page.locator("input[name=category]").fill("qa");
  48 |     };
  49 |     await fill();
  50 |     await page.getByRole("button", { name: /shto artikull/i }).click();
  51 |     await expect(page.getByText(/u shtua/i)).toBeVisible();
  52 | 
  53 |     await fill();
  54 |     await page.getByRole("button", { name: /shto artikull/i }).click();
  55 |     await expect(page.getByText(/përdoret tashmë/i)).toBeVisible();
  56 |     await expect(page.locator("input[name=name]")).toHaveValue("QA retention probe");
  57 |   });
  58 | });
  59 | 
```