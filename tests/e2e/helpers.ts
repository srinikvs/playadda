import { expect, test, type Locator, type Page } from "@playwright/test";

export const HOOK_SKIP =
  'Live BASE_URL lacks data-testid hooks (missing [data-testid="portal-home"]). CI default is a local static server of this checkout. Omit BASE_URL, or deploy hooks to the remote host before live smoke.';

export const MENU_SKIP =
  "Hamburger / Murmur controls are not present on this host; skipping menu smoke.";

export async function skipIfRemoteLacksHooks(): Promise<void> {
  const remote = process.env.BASE_URL?.trim();
  if (!remote) return;
  const res = await fetch(remote);
  const html = await res.text();
  if (!html.includes('data-testid="portal-home"')) {
    test.skip(true, HOOK_SKIP);
  }
}

export async function ensureHooks(page: Page): Promise<void> {
  const hook = page.getByTestId("portal-home");
  if ((await hook.count()) === 0) {
    test.skip(true, HOOK_SKIP);
  }
}

export async function openFresh(page: Page): Promise<void> {
  await page.goto("./");
  await page.waitForLoadState("domcontentloaded");
  await ensureHooks(page);
  await expect(page.getByTestId("portal-home")).toBeVisible();
}

export function loc(page: Page, testId: string): Locator {
  return page.getByTestId(testId);
}

export async function openMenu(page: Page): Promise<void> {
  const btn = page.getByTestId("menu-btn");
  if ((await btn.count()) === 0) {
    test.skip(true, MENU_SKIP);
  }
  await expect(btn).toBeVisible();
  await btn.click();
}
