import { expect, test, type Browser, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { signSession } from "../../server/session.mjs";
import { totp } from "../../server/totp.mjs";
import { injectedSessionKind, storageStateForEnv, storageStateFromCookie } from "./injected-session.ts";

const SESSION_SECRET = process.env.PLAYADDA_AUTH_SECRET || "playadda-test-only-session-secret";
const SHOTS = join(process.cwd(), "test-results");

function adminName(): string {
  return (process.env.PLAYADDA_AUTH_ADMINS || "srini").split(",")[0].trim() || "srini";
}

function sessionState(baseURL: string, name = adminName()) {
  const injected = storageStateForEnv(baseURL);
  if (name === adminName() && injectedSessionKind() && injected) return injected;
  const token = signSession({ name, exp: Date.now() + 60 * 60 * 1000 }, SESSION_SECRET);
  return storageStateFromCookie(baseURL, `playadda_session=${token}`);
}

async function openEnroll(browser: Browser, baseURL: string, name: string | null, viewport: { width: number; height: number }) {
  const context = await browser.newContext({
    viewport,
    ...(name ? { storageState: sessionState(baseURL, name) } : {}),
  });
  const page = await context.newPage();
  return { context, page };
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
  return secret;
}

test("anonymous sessions cannot open enrollment", async ({ browser, baseURL }) => {
  const anon = await openEnroll(browser, baseURL, null, { width: 1280, height: 800 });
  const anonRes = await anon.page.goto("/admin/enroll");
  expect(anonRes?.status()).toBe(401);
  await anon.context.close();
});

test("a signed-in non-admin cannot open enrollment", async ({ browser, baseURL }) => {
  test.skip(Boolean(process.env.BASE_URL?.trim()), "A locally signed non-admin cookie is only valid on the test server");
  const guest = await openEnroll(browser, baseURL, "qa", { width: 1280, height: 800 });
  const guestRes = await guest.page.goto("/admin/enroll");
  expect(guestRes?.status()).toBe(403);
  await guest.context.close();
});

test("admin enrolls from the one-time QR, link, and setup key", async ({ browser, baseURL }) => {
  test.skip(
    Boolean(process.env.BASE_URL?.trim()) && injectedSessionKind() === null,
    "Remote enroll needs PLAYADDA_E2E_STORAGE_STATE or PLAYADDA_E2E_SESSION_COOKIE for an admin session",
  );
  mkdirSync(SHOTS, { recursive: true });
  const desktop = await openEnroll(browser, baseURL, adminName(), { width: 1280, height: 800 });
  const opened = await desktop.page.goto("/admin/enroll");
  expect(opened?.status()).toBe(200);
  const name = `enroll${Date.now().toString().slice(-6)}`;
  const secret = await createSetup(desktop.page, name);
  await desktop.page.evaluate(() => document.fonts.ready);
  await desktop.page.screenshot({ path: join(SHOTS, "enroll-desktop-setup.png"), fullPage: true });
  await desktop.page.getByTestId("enroll-code").fill(totp(secret));
  await desktop.page.getByTestId("enroll-confirm").click();
  await expect(desktop.page.getByTestId("enroll-success")).toContainText(/enrolled/i);
  await expect(desktop.page.getByTestId("enroll-setup")).toBeHidden();
  await expect(desktop.page.getByTestId("enroll-qr").locator("svg")).toHaveCount(0);
  await expect(desktop.page.getByTestId("enroll-user-name").filter({ hasText: name })).toBeVisible();
  await desktop.page.evaluate(() => document.fonts.ready);
  await desktop.page.screenshot({ path: join(SHOTS, "enroll-desktop-confirmed.png"), fullPage: true });
  await desktop.page.reload();
  await expect(desktop.page.getByTestId("enroll-setup")).toBeHidden();
  await expect(desktop.page.getByTestId("enroll-qr").locator("svg")).toHaveCount(0);
  await expect(desktop.page.getByTestId("enroll-user-name").filter({ hasText: name })).toBeVisible();
  await desktop.context.close();

  const phone = await openEnroll(browser, baseURL, adminName(), { width: 412, height: 915 });
  await phone.page.goto("/admin/enroll");
  await createSetup(phone.page, `phone${Date.now().toString().slice(-6)}`);
  await phone.page.evaluate(() => document.fonts.ready);
  await phone.page.screenshot({ path: join(SHOTS, "enroll-phone-setup.png"), fullPage: true });
  await phone.context.close();
});
