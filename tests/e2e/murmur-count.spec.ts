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
  for (const id of ["mode-count", "mode-count-apply", "mode-koya", "mode-diwali", "mode-halloween"]) {
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

  await page.getByTestId("mode-halloween").check();
  await waitForScene(page, (state) => state.mode === "halloween" && state.count === 100);
  await expect(page.getByTestId("mode-count")).toHaveValue("100");
});

test("halloween splits the count and keeps lanterns and bats independent", async ({ page }) => {
  await openFresh(page);
  await openMenu(page);
  const halloween = page.getByTestId("mode-halloween");
  await expect(halloween).toBeVisible();
  const vp = page.viewportSize();
  expect(vp).toBeTruthy();
  const box = await halloween.boundingBox();
  expect(box).toBeTruthy();
  expect(box!.x).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width).toBeLessThanOrEqual(vp!.width + 1);

  await halloween.check();
  await waitForScene(page, (state) => state.mode === "halloween" && state.count === 100);
  await expect(page.locator("#mode-hint")).toContainText(/flicker/i);
  expect(await halloweenCensus(page)).toMatchObject({ lanterns: 50, bats: 50, count: 100 });

  await page.getByTestId("mode-count").fill("7");
  await page.getByTestId("mode-count-apply").click();
  await waitForScene(page, (state) => state.mode === "halloween" && state.count === 7);
  expect(await halloweenCensus(page)).toMatchObject({ lanterns: 3, bats: 4, count: 7 });

  await page.getByTestId("mode-count").fill("80");
  await page.getByTestId("mode-count-apply").click();
  await waitForScene(page, (state) => state.mode === "halloween" && state.count === 80);
  const census = await halloweenCensus(page);
  expect(census).toMatchObject({ lanterns: 40, bats: 40, count: 80 });
  expect(census.lights.some(Boolean)).toBe(true);
  expect(census.lights.some((on) => !on)).toBe(true);

  const lights = census.lights;
  const bats = census.batPos;
  await expect.poll(async () => {
    const now = await halloweenCensus(page);
    let changed = 0;
    for (let i = 0; i < lights.length; i++) if (now.lights[i] !== lights[i]) changed++;
    return changed > 0 && changed < lights.length;
  }).toBe(true);

  await expect.poll(async () => {
    const now = await halloweenCensus(page);
    let sum = 0;
    for (let i = 0; i < bats.length; i++) {
      sum += Math.hypot(now.batPos[i].x - bats[i].x, now.batPos[i].y - bats[i].y);
    }
    return sum / bats.length;
  }).toBeGreaterThan(12);

  await page.reload();
  await waitForScene(page, (state) => state.mode === "halloween" && state.count === 80);
  expect(await halloweenCensus(page)).toMatchObject({ lanterns: 40, bats: 40, count: 80 });
  await openMenu(page);
  await page.getByTestId("mode-cursors").check();
  await waitForScene(page, (state) => state.mode === "cursors" && state.count === 100);
});

async function halloweenCensus(page: Page): Promise<{
  lanterns: number;
  bats: number;
  count: number;
  lights: boolean[];
  batPos: { x: number; y: number }[];
}> {
  return page.evaluate(() => {
    const sim = (globalThis as {
      __murmur?: { agents: { kind: string; on?: boolean; x: number; y: number }[] };
    }).__murmur;
    const agents = sim?.agents ?? [];
    const lights: boolean[] = [];
    const batPos: { x: number; y: number }[] = [];
    let lanterns = 0;
    let bats = 0;
    for (const agent of agents) {
      if (agent.kind === "lantern") {
        lanterns++;
        lights.push(Boolean(agent.on));
      } else if (agent.kind === "bat") {
        bats++;
        batPos.push({ x: agent.x, y: agent.y });
      }
    }
    return { lanterns, bats, count: agents.length, lights, batPos };
  });
}
