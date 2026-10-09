import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createAuthServer } from "./auth.mjs";
import { readSession, signSession } from "./session.mjs";

const SECRET = "playadda-test-only-session-secret";

test("a malformed session cookie is no session", () => {
  assert.equal(readSession({ headers: { cookie: "playadda_session=%" } }, SECRET), null);
  assert.equal(readSession({ headers: { cookie: "playadda_session=%E0%A4%A" } }, SECRET), null);
  const token = signSession({ name: "srini", exp: Date.now() + 60_000 }, SECRET);
  const session = readSession({ headers: { cookie: `playadda_session=${encodeURIComponent(token)}` } }, SECRET);
  assert.equal(session.name, "srini");
});

test("a malformed session cookie on /api/auth/session is 401", async () => {
  const dir = mkdtempSync(join(tmpdir(), "playadda-session-"));
  const server = createAuthServer({
    site: "test",
    port: 0,
    sessionSecret: SECRET,
    usersPath: join(dir, "users.json"),
    scoresPath: join(dir, "scores.json"),
    backupDir: join(dir, "backups"),
    encKey: null,
    admins: ["srini"],
    ttlSec: 3600,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/auth/session`, {
      headers: { cookie: "playadda_session=%" },
    });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, "login required");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
