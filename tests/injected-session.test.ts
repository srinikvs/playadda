import assert from "node:assert/strict";
import { test } from "node:test";
import {
  injectedSessionKind,
  parseSessionCookieHeader,
  storageStateForEnv,
  storageStateFromCookie,
} from "./e2e/injected-session.ts";

const BASE = "https://playaddatest.duckdns.org/";

test("neither env keeps UI login", () => {
  assert.equal(injectedSessionKind({}), null);
  assert.equal(storageStateForEnv(BASE, {}), undefined);
  assert.equal(injectedSessionKind({ PLAYADDA_E2E_STORAGE_STATE: "  ", PLAYADDA_E2E_SESSION_COOKIE: "" }), null);
});

test("storage state path wins and is not opened", () => {
  const env = {
    PLAYADDA_E2E_STORAGE_STATE: "  /tmp/playadda-e2e-storage.json  ",
    PLAYADDA_E2E_SESSION_COOKIE: "playadda_session=example-token",
  };
  assert.equal(injectedSessionKind(env), "storage-state");
  assert.equal(storageStateForEnv(BASE, env), "/tmp/playadda-e2e-storage.json");
});

test("name=value cookie is injected for the BASE_URL origin", () => {
  const env = { PLAYADDA_E2E_SESSION_COOKIE: "playadda_session=example-token" };
  assert.equal(injectedSessionKind(env), "cookie");
  assert.deepEqual(storageStateForEnv(BASE, env), {
    cookies: [
      {
        name: "playadda_session",
        value: "example-token",
        domain: "playaddatest.duckdns.org",
        path: "/",
        expires: -1,
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
      },
    ],
    origins: [],
  });
});

test("raw Cookie header and http origin", () => {
  const state = storageStateFromCookie(
    "http://127.0.0.1:4173/",
    "Cookie: playadda_session=ab.cd=ef; theme=dark",
  );
  assert.equal(state.cookies.length, 2);
  assert.deepEqual(
    state.cookies.map((cookie) => ({ name: cookie.name, value: cookie.value, domain: cookie.domain, secure: cookie.secure })),
    [
      { name: "playadda_session", value: "ab.cd=ef", domain: "127.0.0.1", secure: false },
      { name: "theme", value: "dark", domain: "127.0.0.1", secure: false },
    ],
  );
  assert.equal(state.cookies[0].httpOnly, true);
  assert.equal(state.cookies[0].sameSite, "Lax");
  assert.equal(state.cookies[0].path, "/");
});

test("malformed cookie is rejected without echoing the header", () => {
  const raw = "not-a-cookie super-secret-value";
  assert.throws(
    () => parseSessionCookieHeader(raw),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.equal(err.message.includes("super-secret-value"), false);
      assert.match(err.message, /PLAYADDA_E2E_SESSION_COOKIE/);
      return true;
    },
  );
  assert.throws(() => parseSessionCookieHeader("playadda_session="), /name=value/);
  assert.throws(() => parseSessionCookieHeader("Cookie:"), /name=value/);
});
