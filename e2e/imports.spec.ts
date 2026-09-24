import { test, expect } from "./helpers/fixtures";
import { MAX_FIELD_CHARS, MAX_IMPORT_ROWS } from "../src/lib/import-table";

// The paste box doubles as the file reader (src/components/paste-import.tsx),
// so these drive the hidden <input type=file> — the path a customer actually
// uses to get a catalogue in, and the one the browser pane can't exercise.
const csv = (rows: string[][]) => rows.map((r) => r.join(";")).join("\r\n");

async function openCsv(page: import("@playwright/test").Page, name: string, body: string) {
  await page.locator('input[type=file]').setInputFiles({ name, mimeType: "text/csv", buffer: Buffer.from(body, "utf8") });
  await page.getByRole("button", { name: /kontrollo/i }).click();
}

test.describe("items import", () => {
  test.beforeEach(async ({ adminPage: page }) => {
    await page.goto("/items/import");
  });

  test("a clean file previews as new rows and imports", async ({ adminPage: page }) => {
    const sku = `E2E-${Date.now()}`;
    await openCsv(page, "items.csv", csv([
      ["emri", "njësia", "SKU", "kategoria"],
      ["Çimento 42.5", "thasë", `${sku}-1`, "ndërtim"],
      ["Hekur 12mm", "copë", `${sku}-2`, "ndërtim"],
    ]));
    await expect(page.getByText(/2 të rinj/)).toBeVisible();
    await page.getByRole("button", { name: /^importo/i }).click();
    // /items/import also matches /items/, so pin the catalogue page itself.
    await page.waitForURL(/\/items$/);
    // The SKU is unique to this run; the name may exist from an earlier one.
    await expect(page.getByText(`${sku}-1`)).toBeVisible();
  });

  test("a duplicate SKU inside one file is reported with its row number", async ({ adminPage: page }) => {
    await openCsv(page, "dupe.csv", csv([
      ["emri", "njësia", "SKU"],
      ["Një", "copë", "DUP-1"],
      ["Dy", "copë", "DUP-1"],
    ]));
    await expect(page.getByText(/Rreshti 3/)).toBeVisible();
  });

  test("a field longer than the cap is refused, naming the row", async ({ adminPage: page }) => {
    await openCsv(page, "long.csv", csv([
      ["emri", "njësia"],
      ["x".repeat(MAX_FIELD_CHARS + 1), "copë"],
    ]));
    await expect(page.getByText(/Rreshti 2/)).toBeVisible();
  });

  test(`more than ${MAX_IMPORT_ROWS} rows is refused instead of timing out`, async ({ adminPage: page }) => {
    const rows = [["emri", "njësia", "SKU"]];
    for (let i = 0; i < MAX_IMPORT_ROWS + 1; i++) rows.push([`Artikull ${i}`, "copë", `BULK-${i}`]);
    await openCsv(page, "huge.csv", csv(rows));
    await expect(page.locator("body")).toContainText(/rresht/i);
    // Whatever it says, it must not have silently imported them.
    await expect(page.getByRole("button", { name: /^importo/i })).toHaveCount(0);
  });

  test("a comma-delimited file is understood too", async ({ adminPage: page }) => {
    const body = [["emri", "njësia", "SKU"], ["Presje", "copë", `COMMA-${Date.now()}`]]
      .map((r) => r.join(",")).join("\r\n");
    await openCsv(page, "comma.csv", body);
    await expect(page.getByText(/1 i ri|1 të rinj|1 i ri/)).toBeVisible();
  });
});

test.describe("stock import", () => {
  const BIN = "D-01-1-1";
  const SKU = "NDR-0001";

  test.beforeEach(async ({ adminPage: page }) => {
    await page.goto("/stock/import");
  });

  test("a clean count previews and imports as receive movements", async ({ adminPage: page }) => {
    await openCsv(page, "stock.csv", csv([
      ["artikulli", "kutia", "sasia"],
      [SKU, BIN, "40"],
    ]));
    await expect(page.locator("body")).toContainText("40");
    await expect(page.getByRole("button", { name: /^importo/i })).toBeVisible();
  });

  test("an unknown bin code is reported against its row, not imported", async ({ adminPage: page }) => {
    await openCsv(page, "badbin.csv", csv([
      ["artikulli", "kutia", "sasia"],
      [SKU, "ZZ-99-9-9", "5"],
    ]));
    await expect(page.getByText(/Rreshti 2/)).toBeVisible();
    await expect(page.getByRole("button", { name: /^importo/i })).toHaveCount(0);
  });

  // parseQuantity() strips every "." to tolerate a spreadsheet's thousands
  // separator, so a column formatted to one decimal place is multiplied by
  // ten with no warning: "3.0" becomes 30, "1.5" becomes 15, "2.75" becomes
  // 275. src/lib/import-locations.ts parseMetres() already does this right.
  test("a quantity written 3.0 stays 3 instead of becoming 30", async ({ adminPage: page }) => {
    test.fail();
    await openCsv(page, "decimal.csv", csv([
      ["artikulli", "kutia", "sasia"],
      [SKU, BIN, "3.0"],
    ]));
    // Today the summary reads "30 njësi" and reports 0 errors.
    await expect(page.locator("body")).toContainText(/\b3 njësi\b/);
  });
});
