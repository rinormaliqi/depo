import { test, expect } from "./helpers/fixtures";

// #203: a floor taller than the view used to grow the canvas column instead
// of scrolling it, so the bottom of the plan was cut off and only horizontal
// scrolling worked. A short window and 100% zoom make any seeded floor taller
// than the canvas.
test.describe("the builder canvas", () => {
  test.use({ viewport: { width: 1280, height: 560 } });

  test("scrolls vertically with the wheel, in every mode", async ({ adminPage: page }) => {
    await page.goto("/builder");
    const wrap = page.locator(".canvas-wrap");
    await expect(wrap).toBeVisible();
    await page.keyboard.press("0"); // zoom to 100%

    const size = () => wrap.evaluate((el) => ({ client: el.clientHeight, scroll: el.scrollHeight, top: el.scrollTop }));
    await expect.poll(async () => { const s = await size(); return s.scroll > s.client; }).toBe(true);

    for (const mode of ["h", "v", "i"]) {
      await wrap.evaluate((el) => el.scrollTo(0, 0));
      await page.keyboard.press(mode);
      const box = (await wrap.boundingBox())!;
      await page.mouse.move(box.x + 40, box.y + 40);
      await page.mouse.wheel(0, 300);
      await expect.poll(async () => (await size()).top, { message: `wheel in mode ${mode}` }).toBeGreaterThan(0);
    }
  });

  test("scrolls with the keyboard and zooms only with ctrl + wheel", async ({ adminPage: page }) => {
    await page.goto("/builder");
    const wrap = page.locator(".canvas-wrap");
    await expect(wrap).toBeVisible();
    await page.keyboard.press("0");
    const zoomLabel = page.getByRole("button", { name: /^\d+%$/ });
    await expect(zoomLabel).toHaveText("100%");

    await wrap.evaluate((el) => el.scrollTo(0, 0));
    await page.keyboard.press("PageDown");
    await expect.poll(() => wrap.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    await expect(zoomLabel).toHaveText("100%");

    const box = (await wrap.boundingBox())!;
    await page.mouse.move(box.x + 40, box.y + 40);
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, 300);
    await page.keyboard.up("Control");
    await expect(zoomLabel).not.toHaveText("100%");
  });
});
