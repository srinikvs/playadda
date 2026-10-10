import { expect, test, type Page } from "@playwright/test";
import { openFresh, openMenu } from "./helpers.ts";

async function scene(page: Page): Promise<{ mode: string; count: number }> {
  return page.evaluate(() => {
    const sim = (globalThis as { __murmur?: { mode: string; agents: unknown[] } }).__murmur;
    if (!sim) return { mode: "", count: 0 };
    return { mode: sim.mode, count: sim.agents.length };
  });
}

async function waitForScene(page: Page, ready: (state: { mode: string; count: number }) => boolean): Promise<void> {
  await expect.poll(async () => ready(await scene(page))).toBe(true);
}

test("mode count rebuilds the scene and survives a reload", async ({ page }) => {
  await openFresh(page);
  await waitForScene(page, (state) => state.count > 0);
  expect(await scene(page)).toMatchObject({ mode: "cursors", count: 100 });

  await openMenu(page);
  const field = page.getByTestId("mode-count");
  const apply = page.getByTestId("mode-count-apply");
  await expect(field).toBeVisible();
  await expect(field).toHaveValue("100");
  await expect(apply).toBeVisible();

  const vp = page.viewportSize();
  expect(vp).toBeTruthy();
  const drawer = page.getByTestId("murmur-drawer");
  const overflow = await drawer.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow, "mode menu should not scroll sideways").toBeLessThanOrEqual(1);
  for (const id of ["mode-count", "mode-count-apply", "mode-koya", "mode-diwali"]) {
    const box = await page.getByTestId(id).boundingBox();
    expect(box, id).toBeTruthy();
    expect(box!.x, `${id} left`).toBeGreaterThanOrEqual(-1);
    expect(box!.x + box!.width, `${id} right`).toBeLessThanOrEqual(vp!.width + 1);
  }

  await field.fill("40");
  await apply.click();
  await waitForScene(page, (state) => state.count === 40);
  await expect(field).toHaveValue("40");

  await page.reload();
  await waitForScene(page, (state) => state.mode === "cursors" && state.count === 40);
  await openMenu(page);
  await expect(page.getByTestId("mode-count")).toHaveValue("40");

  await page.getByTestId("mode-koya").check();
  await waitForScene(page, (state) => state.mode === "koya" && state.count === 100);
  await expect(page.getByTestId("mode-count")).toHaveValue("100");

  await page.getByTestId("mode-count").fill("nope");
  await page.getByTestId("mode-count-apply").click();
  await expect(page.getByTestId("mode-count-msg")).toContainText(/whole number/i);
  expect((await scene(page)).count).toBe(100);

  await page.getByTestId("mode-count").fill("-5");
  await page.getByTestId("mode-count-apply").click();
  await expect(page.getByTestId("mode-count-msg")).toHaveText("Enter a number from 1 to 200");
  expect((await scene(page)).count).toBe(100);

  await page.getByTestId("mode-count").fill("12.5");
  await page.getByTestId("mode-count-apply").click();
  expect((await scene(page)).count).toBe(100);

  await page.getByTestId("mode-count").fill("5000");
  await page.getByTestId("mode-count-apply").click();
  await waitForScene(page, (state) => state.count === 200);
  await expect(page.getByTestId("mode-count")).toHaveValue("200");
  await expect(page.getByTestId("mode-count-msg")).toContainText(/1 and 200/);

  await page.reload();
  await waitForScene(page, (state) => state.mode === "koya" && state.count === 200);
  await openMenu(page);
  await expect(page.getByTestId("mode-count")).toHaveValue("200");
  await page.getByTestId("mode-cursors").check();
  await waitForScene(page, (state) => state.mode === "cursors" && state.count === 40);
});

test("an old flock slider value still opens at 100 per mode", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("murmur.params", JSON.stringify({
      count: 180,
      mode: "cursors",
      counts: { cursors: 180, koya: 180, diwali: 180 },
    }));
  });
  await openFresh(page);
  await waitForScene(page, (state) => state.count > 0);
  expect(await scene(page)).toMatchObject({ mode: "cursors", count: 100 });
  await openMenu(page);
  await expect(page.getByTestId("mode-count")).toHaveValue("100");
  await expect(page.locator("#pop")).toHaveValue("100");

  await page.getByTestId("mode-koya").check();
  await waitForScene(page, (state) => state.mode === "koya" && state.count === 100);
  await expect(page.getByTestId("mode-count")).toHaveValue("100");

  await page.getByTestId("mode-diwali").check();
  await waitForScene(page, (state) => state.mode === "diwali" && state.count === 100);
  await expect(page.getByTestId("mode-count")).toHaveValue("100");
});
