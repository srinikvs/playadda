import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createAuthServer } from "./auth.mjs";
import { enrollPageHtml } from "./enroll-page.mjs";
import { createEnrollment, otpauthUrl } from "./enroll.mjs";
import { parseEncKey } from "./secret-box.mjs";
import { signSession } from "./session.mjs";
import { totp } from "./totp.mjs";
import { createStore } from "./users-store.mjs";

const KEY = parseEncKey(Buffer.from("playadda-test-enc-key-32-bytes!!").toString("base64"));
const SESSION = "playadda-test-only-session-secret";

function harness(now = () => 1_700_000_000_000) {
  const dir = mkdtempSync(join(tmpdir(), "playadda-enroll-"));
  const store = createStore({
    usersPath: join(dir, "users.json"),
    scoresPath: join(dir, "scores.json"),
    backupDir: join(dir, "backups"),
    encKey: KEY,
    site: "test",
    now: () => new Date(now()),
  });
  const enrollment = createEnrollment({ store, now, ttlMs: 10 * 60 * 1000 });
  return { dir, store, enrollment };
}

function capture(fn) {
  const lines = [];
  const stdout = process.stdout.write;
  const stderr = process.stderr.write;
  process.stdout.write = (chunk, ...rest) => {
    lines.push(String(chunk));
    return stdout.call(process.stdout, chunk, ...rest);
  };
  process.stderr.write = (chunk, ...rest) => {
    lines.push(String(chunk));
    return stderr.call(process.stderr, chunk, ...rest);
  };
  try {
    return fn(lines);
  } finally {
    process.stdout.write = stdout;
    process.stderr.write = stderr;
  }
}

function enrollMarkup(html) {
  return html.slice(html.indexOf("<body"), html.indexOf("<script"));
}

test("fresh enroll HTML has no authenticator link or setup key", () => {
  const html = enrollPageHtml();
  const markup = enrollMarkup(html);
  assert.equal(html.includes("otpauth://"), false);
  assert.equal(markup.includes("enroll-otpauth"), false);
  assert.equal(markup.includes("<a"), false);
  assert.equal(markup.includes('href="#"'), false);
  assert.doesNotMatch(markup, /id="enroll-secret"[^>]*value=/);
});

test("enrollment shows a 160-bit secret once and saves only after the code matches", () => {
  const { store, enrollment } = harness();
  const begun = capture(() => enrollment.begin("Srini"));
  const setup = begun;
  assert.equal(setup.name, "Srini");
  assert.match(setup.secret, /^[A-Z2-7]{32}$/);
  assert.equal(setup.otpauth, otpauthUrl("Srini", setup.secret));
  assert.match(setup.otpauth, /^otpauth:\/\/totp\/Playadda:Srini\?secret=.+&issuer=Playadda$/);
  assert.match(setup.qrSvg, /<svg/);
  assert.equal(store.listPublic().length, 0);
  assert.throws(() => enrollment.confirm("Srini", "000000"), /did not match/);
  assert.equal(store.listPublic().length, 0);
  const saved = enrollment.confirm("srini", totp(setup.secret, 1_700_000_000_000));
  assert.equal(saved.name, "Srini");
  assert.equal(store.findUser("srini").secret, setup.secret);
  const disk = readFileSync(store.usersPath, "utf8");
  assert.equal(disk.includes(setup.secret), false);
  assert.match(disk, /enc:v1:/);
  assert.equal(JSON.stringify(store.listPublic()).includes(setup.secret), false);
  assert.throws(() => enrollment.begin("srini"), /already enrolled/);
});

test("unconfirmed setups expire and duplicate names are refused", () => {
  let clock = 1_700_000_000_000;
  const { enrollment, store } = harness(() => clock);
  const first = enrollment.begin("Ada");
  clock += 10 * 60 * 1000 + 1;
  assert.throws(() => enrollment.confirm("Ada", totp(first.secret, clock)), /expired/);
  assert.equal(store.listPublic().length, 0);
  const again = enrollment.begin("Ada");
  enrollment.confirm("Ada", totp(again.secret, clock));
  assert.throws(() => enrollment.begin("ada"), /already enrolled/);
  enrollment.remove("ADA");
  assert.equal(store.listPublic().length, 0);
});

test("secrets and codes are not written to stdout or stderr", () => {
  const { enrollment } = harness();
  let secret = "";
  let code = "";
  const lines = [];
  const stdout = process.stdout.write;
  const stderr = process.stderr.write;
  process.stdout.write = (chunk, ...rest) => {
    lines.push(String(chunk));
    return stdout.call(process.stdout, chunk, ...rest);
  };
  process.stderr.write = (chunk, ...rest) => {
    lines.push(String(chunk));
    return stderr.call(process.stderr, chunk, ...rest);
  };
  try {
    const setup = enrollment.begin("Nia");
    secret = setup.secret;
    code = totp(secret, 1_700_000_000_000);
    enrollment.confirm("Nia", code);
    enrollment.confirm("Nia", "000000");
  } catch {
    /* wrong second confirm is expected */
  } finally {
    process.stdout.write = stdout;
    process.stderr.write = stderr;
  }
  const blob = lines.join("\n");
  assert.equal(blob.includes(secret), false);
  assert.equal(blob.includes(code), false);
});

test("admin routes require an admin session and never return stored secrets", async () => {
  const dir = mkdtempSync(join(tmpdir(), "playadda-http-"));
  const usersPath = join(dir, "users.json");
  const config = {
    site: "test",
    port: 0,
    sessionSecret: SESSION,
    usersPath,
    scoresPath: join(dir, "scores.json"),
    backupDir: join(dir, "backups"),
    encKey: KEY,
    admins: ["srini"],
    ttlSec: 3600,
  };
  const server = createAuthServer(config);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  const cookie = (name) => {
    const token = signSession({ name, exp: Date.now() + 60_000 }, SESSION);
    return `playadda_session=${encodeURIComponent(token)}`;
  };
  const call = async (path, { method = "GET", name, body } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        ...(name ? { cookie: cookie(name) } : {}),
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, text, json: text.startsWith("{") || text.startsWith("[") ? JSON.parse(text) : null };
  };
  try {
    assert.equal((await call("/admin/enroll")).status, 401);
    assert.equal((await call("/admin/enroll", { name: "qa" })).status, 403);
    assert.equal((await call("/api/admin/users")).status, 401);
    const page = await call("/admin/enroll", { name: "srini" });
    assert.equal(page.status, 200);
    assert.match(page.text, /data-testid="enroll-name"/);
    assert.equal(page.text.includes("otpauth://"), false);
    assert.equal(enrollMarkup(page.text).includes("enroll-otpauth"), false);
    assert.equal(enrollMarkup(page.text).includes("<a"), false);
    const setup = await call("/api/admin/enroll", { method: "POST", name: "srini", body: { name: "New User" } });
    assert.equal(setup.status, 200);
    assert.match(setup.json.otpauth, /^otpauth:\/\/totp\/Playadda:New%20User\?/);
    const saved = await call("/api/admin/enroll/confirm", {
      method: "POST",
      name: "srini",
      body: { name: "New User", code: totp(setup.json.secret, Date.now()) },
    });
    assert.equal(saved.status, 200);
    assert.equal(saved.text.includes(setup.json.secret), false);
    const listed = await call("/api/admin/users", { name: "srini" });
    assert.equal(listed.text.includes(setup.json.secret), false);
    assert.equal(listed.json.users.some((user) => user.name === "New User"), true);
    const disk = readFileSync(usersPath, "utf8");
    assert.equal(disk.includes(setup.json.secret), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("login still accepts an existing plaintext user", async () => {
  const dir = mkdtempSync(join(tmpdir(), "playadda-login-"));
  const usersPath = join(dir, "users.json");
  const { writeFileSync } = await import("node:fs");
  writeFileSync(usersPath, JSON.stringify({ users: [{ name: "qa", secret: "JBSWY3DPEHPK3PXP" }] }));
  const config = {
    site: "test",
    port: 0,
    sessionSecret: SESSION,
    usersPath,
    scoresPath: join(dir, "scores.json"),
    backupDir: join(dir, "backups"),
    encKey: null,
    admins: ["srini"],
    ttlSec: 3600,
  };
  const server = createAuthServer(config);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "qa", code: totp("JBSWY3DPEHPK3PXP") }),
    });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("set-cookie") || "", /playadda_session=/);
    const disk = readFileSync(usersPath, "utf8");
    assert.match(disk, /JBSWY3DPEHPK3PXP/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
