import { expect, test, type Browser, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { signSession } from "../../server/session.mjs";
import { totp } from "../../server/totp.mjs";
import {
  storageStateForEnv,
  storageStateFromCookie,
  type InjectedStorageState,
} from "./injected-session.ts";

const SESSION_SECRET = process.env.PLAYADDA_AUTH_SECRET || "playadda-test-only-session-secret";
const ADMIN_STORAGE_ENV = "PLAYADDA_E2E_ADMIN_STORAGE_STATE";
const SHOTS = join(process.cwd(), "test-results");
const ADMIN_SKIP =
  "Admin enroll happy path needs PLAYADDA_E2E_ADMIN_STORAGE_STATE when BASE_URL is set. The injected CI session is not an admin.";

function remoteBase(): boolean {
  return Boolean(process.env.BASE_URL?.trim());
}

function adminName(): string {
  return (process.env.PLAYADDA_AUTH_ADMINS || "srini").split(",")[0].trim() || "srini";
}

function emptyStorage(): InjectedStorageState {
  return { cookies: [], origins: [] };
}

function signedStorage(baseURL: string, name: string): InjectedStorageState {
  const token = signSession({ name, exp: Date.now() + 60 * 60 * 1000 }, SESSION_SECRET);
  return storageStateFromCookie(baseURL, `playadda_session=${token}`);
}

/**
 * Local runs (no BASE_URL) mint the fixture admin. A remote run uses only
 * PLAYADDA_E2E_ADMIN_STORAGE_STATE. The injected CI session is never an admin.
 */
function adminStorageState(baseURL: string): string | InjectedStorageState | undefined {
  const explicit = process.env[ADMIN_STORAGE_ENV]?.trim();
  if (explicit) return explicit;
  if (remoteBase()) return undefined;
  return signedStorage(baseURL, adminName());
}

async function openContext(
  browser: Browser,
  storageState: string | InjectedStorageState,
  viewport: { width: number; height: number },
) {
  const context = await browser.newContext({ viewport, storageState });
  const page = await context.newPage();
  return { context, page };
}

async function secretMaterial(page: Page): Promise<string> {
  return page.evaluate(() => {
    const bits = [document.documentElement.innerHTML];
    document.querySelectorAll("input, textarea").forEach((el) => {
      bits.push((el as HTMLInputElement).value || "");
    });
    document.querySelectorAll("a").forEach((el) => {
      bits.push(el.getAttribute("href") || "");
    });
    return bits.join("\n");
  });
}

async function expectNoSecretMaterial(page: Page, secret?: string) {
  await expect(page.getByTestId("enroll-otpauth")).toHaveCount(0);
  await expect(page.getByTestId("enroll-qr").locator("svg")).toHaveCount(0);
  const blob = await secretMaterial(page);
  expect(blob).not.toContain("otpauth://");
  if (secret) expect(blob).not.toContain(secret);
  const key = page.getByTestId("enroll-secret");
  if (await key.count()) await expect(key).toHaveValue("");
}

async function createSetup(page: Page, name: string) {
  await page.getByTestId("enroll-name").fill(name);
  await page.getByTestId("enroll-create").click();
  await expect(page.getByTestId("enroll-setup")).toBeVisible();
  await expect(page.getByTestId("enroll-qr").locator("svg")).toBeVisible();
  await expect(page.getByTestId("enroll-otpauth")).toHaveText("Add to authenticator");
  await expect(page.getByTestId("enroll-otpauth")).toHaveAttribute("href", /^otpauth:\/\/totp\/Playadda:/);
  const secret = await page.getByTestId("enroll-secret").inputValue();
  expect(secret).toMatch(/^[A-Z2-7]{32}$/);
  expect(await secretMaterial(page)).toContain(secret);
  return secret;
}

test("anonymous sessions cannot open enrollment", async ({ browser }) => {
  const anon = await openContext(browser, emptyStorage(), { width: 1280, height: 800 });
  await anon.context.clearCookies();
  const anonRes = await anon.page.goto("/admin/enroll");
  expect(anonRes?.status()).toBe(401);
  expect(await anon.page.content()).not.toContain("otpauth://");
  await expect(anon.page.getByTestId("enroll-otpauth")).toHaveCount(0);
  await anon.context.close();
});

test("a signed-in non-admin cannot open enrollment", async ({ browser, baseURL }) => {
  const injected = storageStateForEnv(baseURL);
  test.skip(
    remoteBase() && !injected,
    "Remote non-admin enroll check needs PLAYADDA_E2E_STORAGE_STATE or PLAYADDA_E2E_SESSION_COOKIE",
  );
  const storageState = remoteBase() ? injected! : signedStorage(baseURL, "qa");
  const guest = await openContext(browser, storageState, { width: 1280, height: 800 });
  const guestRes = await guest.page.goto("/admin/enroll");
  expect(guestRes?.status()).toBe(403);
  await expectNoSecretMaterial(guest.page);
  await guest.context.close();
});

test("admin enrolls from the one-time QR, link, and setup key", async ({ browser, baseURL }) => {
  const state = adminStorageState(baseURL);
  test.skip(!state, ADMIN_SKIP);
  mkdirSync(SHOTS, { recursive: true });
  const desktop = await openContext(browser, state, { width: 1280, height: 800 });
  const opened = await desktop.page.goto("/admin/enroll");
  expect(opened?.status()).toBe(200);
  await expectNoSecretMaterial(desktop.page);
  const name = `enroll${Date.now().toString().slice(-6)}`;
  const secret = await createSetup(desktop.page, name);
  await desktop.page.evaluate(() => document.fonts.ready);
  await desktop.page.screenshot({ path: join(SHOTS, "enroll-desktop-setup.png"), fullPage: true });
  await desktop.page.getByTestId("enroll-code").fill(totp(secret));
  await desktop.page.getByTestId("enroll-confirm").click();
  await expect(desktop.page.getByTestId("enroll-success")).toContainText(/enrolled/i);
  await expect(desktop.page.getByTestId("enroll-setup")).toBeHidden();
  await expect(desktop.page.getByTestId("enroll-user-name").filter({ hasText: name })).toBeVisible();
  await expectNoSecretMaterial(desktop.page, secret);
  await desktop.page.evaluate(() => document.fonts.ready);
  await desktop.page.screenshot({ path: join(SHOTS, "enroll-desktop-confirmed.png"), fullPage: true });
  await desktop.page.reload();
  await expect(desktop.page.getByTestId("enroll-setup")).toBeHidden();
  await expect(desktop.page.getByTestId("enroll-user-name").filter({ hasText: name })).toBeVisible();
  await expectNoSecretMaterial(desktop.page, secret);
  await desktop.context.close();

  const phone = await openContext(browser, state, { width: 412, height: 915 });
  await phone.page.goto("/admin/enroll");
  await expectNoSecretMaterial(phone.page);
  await createSetup(phone.page, `phone${Date.now().toString().slice(-6)}`);
  await phone.page.evaluate(() => document.fonts.ready);
  await phone.page.screenshot({ path: join(SHOTS, "enroll-phone-setup.png"), fullPage: true });
  await phone.context.close();
});

test("an unconfirmed setup drops the otpauth link and key when it expires", async ({ browser, baseURL }) => {
  const state = adminStorageState(baseURL);
  test.skip(!state, ADMIN_SKIP);
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    storageState: state,
  });
  const page = await context.newPage();
  await page.clock.install({ time: new Date() });
  await page.goto("/admin/enroll");
  const secret = await createSetup(page, `exp${Date.now().toString().slice(-6)}`);
  await page.clock.fastForward(10 * 60 * 1000 + 1500);
  await expect(page.getByTestId("enroll-error")).toContainText(/expired/i);
  await expect(page.getByTestId("enroll-setup")).toBeHidden();
  await expectNoSecretMaterial(page, secret);
  await context.close();
});
