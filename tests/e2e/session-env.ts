import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/** Jenkins Credentials mint the playaddatest cookie. Never commit that file or cookie. */
export const STORAGE_STATE_ENV = "PLAYADDA_E2E_STORAGE_STATE";
export const SESSION_COOKIE_ENV = "PLAYADDA_E2E_SESSION_COOKIE";
const GENERATED = resolve("test-results/e2e-storage-state.json");

export function jenkinsSessionInjected(): boolean {
  return Boolean(process.env[STORAGE_STATE_ENV]?.trim() || process.env[SESSION_COOKIE_ENV]?.trim());
}

function cookieValue(raw: string): string {
  const trimmed = raw.trim();
  const prefixed = trimmed.match(/^playadda_session=(.*)$/);
  return prefixed ? prefixed[1] : trimmed;
}

function hostFromBase(): string {
  const base = process.env.BASE_URL?.trim() || "http://127.0.0.1:4173/";
  return new URL(base).hostname;
}

/** Resolve a Playwright storageState path. Cookie env writes a gitignored file. */
export function resolveStorageState(): string | undefined {
  const path = process.env[STORAGE_STATE_ENV]?.trim();
  if (path) {
    if (!existsSync(path)) throw new Error(`${STORAGE_STATE_ENV} file not found: ${path}`);
    return path;
  }
  const cookie = process.env[SESSION_COOKIE_ENV]?.trim();
  if (!cookie) return undefined;
  mkdirSync(dirname(GENERATED), { recursive: true });
  const secure = (process.env.BASE_URL || "").startsWith("https://");
  writeFileSync(GENERATED, JSON.stringify({
    cookies: [{
      name: "playadda_session",
      value: cookieValue(cookie),
      domain: hostFromBase(),
      path: "/",
      httpOnly: true,
      secure,
      sameSite: "Lax",
    }],
    origins: [],
  }, null, 2));
  return GENERATED;
}

export function assertStorageState(): void {
  const path = process.env[STORAGE_STATE_ENV]?.trim();
  if (path && !existsSync(path)) throw new Error(`${STORAGE_STATE_ENV} file not found: ${path}`);
  if (path) readFileSync(path); // existence only; do not log contents
  resolveStorageState();
}
