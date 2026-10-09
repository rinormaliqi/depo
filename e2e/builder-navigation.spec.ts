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
    const zoomLabel = page.getByRole("button", { name: /^[\d.]+%$/ });
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

  // #204: "fit" used to stop at 30%, so a big floor never fit on screen.
  test("fit shows the whole floor, with no scrolling left to do", async ({ adminPage: page }) => {
    await page.goto("/builder");
    const wrap = page.locator(".canvas-wrap");
    await expect(wrap).toBeVisible();
    await page.keyboard.press("0");
    await page.keyboard.press("1");
    await expect.poll(() => wrap.evaluate((el) => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight)).toBe(true);
    // Nothing overflows, so there is nothing for the minimap to show.
    await expect(page.locator(".canvas-minimap")).toHaveCount(0);
    await expect(page.locator(".canvas-scale")).toBeVisible();
  });

  test("the minimap appears when zoomed in and moves the view", async ({ adminPage: page }) => {
    await page.goto("/builder");
    const wrap = page.locator(".canvas-wrap");
    await expect(wrap).toBeVisible();
    for (let i = 0; i < 6; i++) await page.keyboard.press("Equal");
    const minimap = page.locator(".canvas-minimap");
    await expect(minimap).toBeVisible();
    await wrap.evaluate((el) => el.scrollTo(0, 0));
    const box = (await minimap.boundingBox())!;
    await page.mouse.click(box.x + box.width - 3, box.y + box.height - 3);
    await expect.poll(() => wrap.evaluate((el) => el.scrollLeft > 0 && el.scrollTop > 0)).toBe(true);
  });
});
