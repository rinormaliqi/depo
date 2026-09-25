import { test as base, expect, type Page } from "@playwright/test";
import { accounts, PASSWORD, type Account } from "./accounts";

// Signs in through the real form rather than forging a session cookie, so
// every spec also exercises the credentials path and the redirect that
// follows it. Selectors use the input `name` attributes: the UI ships in
// Albanian and English and copy changes often, the field names don't.
export async function signIn(page: Page, account: Account) {
  await page.goto("/login");
  await page.locator("input[name=email]").fill(account.email);
  await page.locator("input[name=password]").fill(PASSWORD);
  await page.getByRole("button", { name: /kyçu|sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });
}

export async function signOut(page: Page) {
  await page.context().clearCookies();
}

type Fixtures = {
  /** A page already signed in as the paid business admin — the default actor. */
  adminPage: Page;
  /** A page signed in as a worker of the same paid organization. */
  workerPage: Page;
};

export const test = base.extend<Fixtures>({
  adminPage: async ({ page }, use) => {
    await signIn(page, accounts.paidAdmin);
    await use(page);
  },
  workerPage: async ({ page }, use) => {
    await signIn(page, accounts.paidWorker);
    await use(page);
  },
});

export { expect, accounts, PASSWORD };
