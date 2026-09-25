import { test, expect, accounts } from "./helpers/fixtures";
import { signIn } from "./helpers/fixtures";

test.describe("metrics", () => {
  test("reports area, locations and a movement log", async ({ adminPage: page }) => {
    await page.goto("/metrics");
    await expect(page.locator("body")).toContainText(/m²/);
    await expect(page.locator("body")).toContainText(/REGJISTRI I LËVIZJEVE/i);
  });

  // Every storage location belongs to exactly one zone, so the per-zone
  // counts must add up to the facility's own total. They stop adding up
  // when an object escapes its zone — which is what an out-of-bounds
  // rack does, and then its stock silently vanishes from utilisation.
  test("the per-zone counts add up to the facility total", async ({ adminPage: page }) => {
    await page.goto("/metrics");
    const body = await page.locator("body").innerText();
    const total = Number(body.match(/VENDNDODHJE AKTIVE\s*\n\s*([\d.,]+)/)?.[1]?.replace(/[.,]/g, ""));
    const perZone = [...body.matchAll(/(\d+) nga (\d+) vendndodhje/g)].map((m) => Number(m[2]));
    test.skip(!total || perZone.length === 0, "no zones on this facility");
    expect(perZone.reduce((a, b) => a + b, 0)).toBe(total);
  });

  test("a worker is kept out of metrics", async ({ page }) => {
    await signIn(page, accounts.paidWorker);
    await page.goto("/metrics");
    await expect(page.locator("body")).not.toContainText(/REGJISTRI I LËVIZJEVE/i);
  });
});

test.describe("labels", () => {
  test("prints one label per bin, each with a QR", async ({ adminPage: page }) => {
    await page.goto("/labels");
    const claimed = Number((await page.locator("body").innerText()).match(/([\d.,]+)\s*etiketa/)?.[1]?.replace(/[.,]/g, ""));
    expect(claimed).toBeGreaterThan(0);
    await expect(page.locator(".label")).toHaveCount(claimed);
    await expect(page.locator(".label-qr svg")).toHaveCount(claimed);
  });

  // The QR spec wants four modules of white around a symbol or a scanner
  // may not find its edges. It used to be generated with margin: 0, leaving
  // only what the label's own padding happened to give — about three
  // modules above and below. Carrying it inside the SVG makes it
  // independent of the box: the dark modules now start four in.
  test("each QR carries its own quiet zone", async ({ adminPage: page }) => {
    await page.goto("/labels");
    const d = await page.locator(".label-qr svg path[stroke]").first().getAttribute("d");
    const firstX = Number(d?.match(/^M(\d+(?:\.\d+)?)/)?.[1] ?? 0);
    expect(firstX, "dark modules must start inside a quiet zone").toBeGreaterThanOrEqual(4);
  });

  test("every label carries its code and path", async ({ adminPage: page }) => {
    await page.goto("/labels");
    const first = page.locator(".label").first();
    await expect(first.locator(".label-code")).not.toBeEmpty();
    await expect(first.locator(".label-path")).not.toBeEmpty();
  });
});
