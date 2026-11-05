import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createAuthServer } from "./auth.mjs";

const ALLOWED_ORIGIN = "https://appassets.androidplatform.net";
const PRIVATE_FIELDS = ["password", "totp", "secret", "email", "session"];

// Synthetic fixtures only: nothing here is real user data.
function fixtureScores(count = 3) {
  const users = {};
  for (let i = 1; i <= count; i += 1) {
    users[`player${i}`] = {
      name: `Player${i}`,
      email: `player${i}@example.invalid`,
      password: "synthetic-password",
      totp: "SYNTHETICTOTP",
      secret: "synthetic-secret",
      session: "synthetic-session",
      games: { snake: i * 10, sudoku: 5 },
      best: i * 10,
    };
  }
  return { users, overall: { score: count * 10, name: `Player${count}`, game: "snake" } };
}

async function withServer(scores, fn) {
  const dir = mkdtempSync(join(tmpdir(), "playadda-leaderboard-"));
  const scoresPath = join(dir, "scores.json");
  const usersPath = join(dir, "users.json");
  if (scores) writeFileSync(scoresPath, JSON.stringify(scores));
  const server = createAuthServer({
    site: "test",
    port: 0,
    sessionSecret: "playadda-test-only-session-secret",
    usersPath,
    scoresPath,
    backupDir: join(dir, "backups"),
    encKey: null,
    admins: [],
    ttlSec: 3600,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn({ base, scoresPath });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("GET /api/leaderboard returns ranked names and scores without login", async () => {
  await withServer(fixtureScores(3), async ({ base }) => {
    const res = await fetch(`${base}/api/leaderboard`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /application\/json/);
    const body = await res.json();
    assert.ok(Array.isArray(body.entries));
    assert.deepEqual(body.entries.map((e) => e.name), ["Player3", "Player2", "Player1"]);
    assert.deepEqual(body.entries.map((e) => e.score), [30, 20, 10]);
    assert.deepEqual(body.entries.map((e) => e.rank), [1, 2, 3]);
  });
});

test("leaderboard entries expose only rank, name and score", async () => {
  await withServer(fixtureScores(3), async ({ base }) => {
    const text = await (await fetch(`${base}/api/leaderboard`)).text();
    for (const entry of JSON.parse(text).entries) {
      assert.deepEqual(Object.keys(entry).sort(), ["name", "rank", "score"]);
    }
    for (const field of PRIVATE_FIELDS) {
      assert.ok(!text.toLowerCase().includes(field), `response leaked ${field}`);
    }
    assert.ok(!text.includes("example.invalid"));
  });
});

test("returns an empty list when scores.json does not exist", async () => {
  await withServer(null, async ({ base }) => {
    const res = await fetch(`${base}/api/leaderboard`);
    assert.equal(res.status, 200);
    assert.deepEqual((await res.json()).entries, []);
  });
});

test("returns an empty list when nobody has a score", async () => {
  await withServer({ users: {}, overall: { score: 0, name: "", game: "" } }, async ({ base }) => {
    const res = await fetch(`${base}/api/leaderboard`);
    assert.deepEqual((await res.json()).entries, []);
  });
});

test("limit defaults to 10", async () => {
  await withServer(fixtureScores(15), async ({ base }) => {
    const body = await (await fetch(`${base}/api/leaderboard`)).json();
    assert.equal(body.entries.length, 10);
  });
});

test("limit is honoured below the cap and capped at 50", async () => {
  await withServer(fixtureScores(60), async ({ base }) => {
    assert.equal((await (await fetch(`${base}/api/leaderboard?limit=3`)).json()).entries.length, 3);
    assert.equal((await (await fetch(`${base}/api/leaderboard?limit=500`)).json()).entries.length, 50);
  });
});

test("an invalid limit falls back to the default", async () => {
  await withServer(fixtureScores(15), async ({ base }) => {
    for (const bad of ["abc", "0", "-4"]) {
      const body = await (await fetch(`${base}/api/leaderboard?limit=${bad}`)).json();
      assert.equal(body.entries.length, 10, `limit=${bad}`);
    }
  });
});

test("game filter ranks by that game and ignores players without a score in it", async () => {
  const scores = fixtureScores(3);
  scores.users.player1.games.pong = 99;
  await withServer(scores, async ({ base }) => {
    const body = await (await fetch(`${base}/api/leaderboard?game=pong`)).json();
    assert.equal(body.game, "pong");
    assert.deepEqual(body.entries.map((e) => [e.name, e.score]), [["Player1", 99]]);
  });
});

test("an unknown or prototype-named game yields an empty list", async () => {
  await withServer(fixtureScores(3), async ({ base }) => {
    for (const game of ["nope", "__proto__", "constructor"]) {
      const body = await (await fetch(`${base}/api/leaderboard?game=${game}`)).json();
      assert.deepEqual(body.entries, [], game);
    }
  });
});

test("leaderboard is read-only: scores.json is unchanged and POST is not accepted", async () => {
  await withServer(fixtureScores(3), async ({ base, scoresPath }) => {
    const before = readFileSync(scoresPath, "utf8");
    await fetch(`${base}/api/leaderboard?limit=5`);
    const post = await fetch(`${base}/api/leaderboard`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ game: "snake", score: 9999 }),
    });
    assert.notEqual(post.status, 200);
    assert.equal(readFileSync(scoresPath, "utf8"), before);
  });
});

test("existing auth behaviour is unchanged: /api/scores still needs login", async () => {
  await withServer(fixtureScores(1), async ({ base }) => {
    assert.equal((await fetch(`${base}/api/scores`)).status, 401);
    assert.equal((await fetch(`${base}/api/auth/session`)).status, 401);
  });
});

test("CORS reflects an allowed origin with credentials and Vary: Origin", async () => {
  await withServer(fixtureScores(2), async ({ base }) => {
    const res = await fetch(`${base}/api/leaderboard`, { headers: { origin: ALLOWED_ORIGIN } });
    assert.equal(res.headers.get("access-control-allow-origin"), ALLOWED_ORIGIN);
    assert.equal(res.headers.get("access-control-allow-credentials"), "true");
    assert.match(res.headers.get("vary") || "", /Origin/i);
  });
});

test("CORS headers also apply to other API responses such as a 401", async () => {
  await withServer(fixtureScores(1), async ({ base }) => {
    const res = await fetch(`${base}/api/scores`, { headers: { origin: ALLOWED_ORIGIN } });
    assert.equal(res.status, 401);
    assert.equal(res.headers.get("access-control-allow-origin"), ALLOWED_ORIGIN);
  });
});

test("OPTIONS preflight from an allowed origin is answered with methods and headers", async () => {
  await withServer(fixtureScores(1), async ({ base }) => {
    const res = await fetch(`${base}/api/scores`, {
      method: "OPTIONS",
      headers: {
        origin: ALLOWED_ORIGIN,
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type",
      },
    });
    assert.equal(res.status, 204);
    assert.equal(res.headers.get("access-control-allow-origin"), ALLOWED_ORIGIN);
    assert.equal(res.headers.get("access-control-allow-credentials"), "true");
    assert.match(res.headers.get("access-control-allow-methods"), /POST/);
    assert.match(res.headers.get("access-control-allow-headers"), /content-type/i);
    assert.match(res.headers.get("vary") || "", /Origin/i);
  });
});

test("a disallowed origin gets no Access-Control-Allow-Origin, on GET or preflight", async () => {
  await withServer(fixtureScores(1), async ({ base }) => {
    const origin = "https://evil.example";
    const get = await fetch(`${base}/api/leaderboard`, { headers: { origin } });
    assert.equal(get.headers.get("access-control-allow-origin"), null);
    assert.equal(get.headers.get("access-control-allow-credentials"), null);
    const pre = await fetch(`${base}/api/leaderboard`, {
      method: "OPTIONS",
      headers: { origin, "access-control-request-method": "GET" },
    });
    assert.equal(pre.headers.get("access-control-allow-origin"), null);
  });
});

test("CORS never uses a wildcard and http://localhost is not allowed with credentials", async () => {
  await withServer(fixtureScores(1), async ({ base }) => {
    const none = await fetch(`${base}/api/leaderboard`);
    assert.notEqual(none.headers.get("access-control-allow-origin"), "*");
    const local = await fetch(`${base}/api/leaderboard`, { headers: { origin: "http://localhost" } });
    assert.equal(local.headers.get("access-control-allow-origin"), null);
  });
});

test("capacitor://localhost (iOS WebView) is an allowed origin", async () => {
  await withServer(fixtureScores(1), async ({ base }) => {
    const res = await fetch(`${base}/api/leaderboard`, { headers: { origin: "capacitor://localhost" } });
    assert.equal(res.headers.get("access-control-allow-origin"), "capacitor://localhost");
  });
});
