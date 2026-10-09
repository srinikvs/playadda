/**
 * Loads a Jenkins-injected Playadda session for Playwright.
 * Env format is documented on `loginIfNeeded` in `./helpers.ts`.
 * Do not commit storage state, cookies, or authenticator secrets.
 */

export type InjectedSessionKind = "storage-state" | "cookie";

export type SessionCookie = {
  name: string;
  value: string;
};

export type InjectedStorageState = {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: "Lax";
  }>;
  origins: [];
};

const COOKIE_ENV = "PLAYADDA_E2E_SESSION_COOKIE";
const STORAGE_ENV = "PLAYADDA_E2E_STORAGE_STATE";

export function injectedSessionKind(
  env: NodeJS.ProcessEnv = process.env,
): InjectedSessionKind | null {
  if (env[STORAGE_ENV]?.trim()) return "storage-state";
  if (env[COOKIE_ENV]?.trim()) return "cookie";
  return null;
}

export function parseSessionCookieHeader(raw: string): SessionCookie[] {
  let header = raw.trim();
  if (/^cookie:/i.test(header)) header = header.replace(/^cookie:\s*/i, "").trim();
  if (!header) {
    throw new Error(`${COOKIE_ENV} must be name=value or a Cookie header (name=value; name2=value2)`);
  }
  const cookies = header.split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
    const eq = part.indexOf("=");
    if (eq <= 0) {
      throw new Error(`${COOKIE_ENV} must be name=value or a Cookie header (name=value; name2=value2)`);
    }
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (!name || !value) {
      throw new Error(`${COOKIE_ENV} must be name=value or a Cookie header (name=value; name2=value2)`);
    }
    return { name, value };
  });
  if (cookies.length === 0) {
    throw new Error(`${COOKIE_ENV} must be name=value or a Cookie header (name=value; name2=value2)`);
  }
  return cookies;
}

export function storageStateFromCookie(baseURL: string, raw: string): InjectedStorageState {
  const origin = new URL(baseURL);
  const secure = origin.protocol === "https:";
  return {
    cookies: parseSessionCookieHeader(raw).map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: origin.hostname,
      path: "/",
      expires: -1,
      httpOnly: true,
      secure,
      sameSite: "Lax" as const,
    })),
    origins: [],
  };
}

/** Path, generated storage state, or unset. Storage-state path wins over the cookie. */
export function storageStateForEnv(
  baseURL: string,
  env: NodeJS.ProcessEnv = process.env,
): string | InjectedStorageState | undefined {
  const statePath = env[STORAGE_ENV]?.trim();
  if (statePath) return statePath;
  const raw = env[COOKIE_ENV]?.trim();
  if (!raw) return undefined;
  return storageStateFromCookie(baseURL, raw);
}
