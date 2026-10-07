import { expect, test, type Locator, type Page } from "@playwright/test";
import { totp } from "../../server/totp.mjs";
import { jenkinsSessionInjected } from "./session-env.ts";

export const HOOK_SKIP =
  'Live BASE_URL lacks data-testid hooks (missing [data-testid="portal-home"]). CI default is a local static server of this checkout. Omit BASE_URL, or deploy hooks to the remote host before live smoke.';

export const MENU_SKIP =
  "Hamburger / Murmur controls are not present on this host; skipping menu smoke.";

const TEST_SECRET = "JBSWY3DPEHPK3PXP";

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

export async function loginIfNeeded(page: Page): Promise<void> {
  // Jenkins Credentials inject PLAYADDA_E2E_STORAGE_STATE or PLAYADDA_E2E_SESSION_COOKIE.
  // When either is set, do not type a name or TOTP. Minting stays on the host.
  if (jenkinsSessionInjected()) {
    const overlay = page.getByTestId("login-overlay");
    if ((await overlay.count()) > 0 && (await overlay.isVisible())) {
      throw new Error("Jenkins session was injected but the login overlay is still visible");
    }
    return;
  }
  const overlay = page.getByTestId("login-overlay");
  if ((await overlay.count()) === 0 || !(await overlay.isVisible())) return;
  await page.getByTestId("login-name").fill("qa");
  await page.getByTestId("login-code").fill(totp(TEST_SECRET));
  await page.getByTestId("login-submit").click();
  await expect(overlay).toBeHidden();
}

export async function openFresh(page: Page): Promise<void> {
  await page.goto("./");
  await page.waitForLoadState("domcontentloaded");
  await ensureHooks(page);
  await loginIfNeeded(page);
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
