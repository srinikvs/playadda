import { expect, test } from "@playwright/test";
import { totp } from "../../server/totp.mjs";

const TEST_SECRET = "JBSWY3DPEHPK3PXP";

test("invalid authenticator code stays on login", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByTestId("login-overlay")).toBeVisible();
  await expect(page.getByTestId("portal-home")).toBeHidden();
  await page.getByTestId("login-name").fill("qa");
  await page.getByTestId("login-code").fill("000000");
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("login-error")).toContainText(/wrong/i);
  await expect(page.getByTestId("login-overlay")).toBeVisible();
});

test("valid name and code unlocks portal scores", async ({ page }) => {
  await page.goto("./");
  await page.getByTestId("login-name").fill("QA");
  await page.getByTestId("login-code").fill(totp(TEST_SECRET));
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("portal-home")).toBeVisible();
  await expect(page.getByTestId("account-name")).toHaveText("qa");
  await expect(page.getByTestId("overall-best")).toBeVisible();
  await page.evaluate(() => window.playadda.submitScore("portal", 42));
  await expect(page.getByTestId("user-best")).toContainText("42");
  await expect(page.getByTestId("overall-best")).toContainText("42");
});
