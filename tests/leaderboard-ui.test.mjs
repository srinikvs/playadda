import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_API_BASE, TEST_API_BASE, loadLeaderboard, resolveApiBase } from "../js/leaderboard.js";

const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test("api base defaults to prod", () => {
  assert.equal(resolveApiBase(undefined), DEFAULT_API_BASE);
  assert.equal(DEFAULT_API_BASE, "https://playadda.duckdns.org");
});

test("api base accepts the test host and rejects unknown hosts", () => {
  assert.equal(resolveApiBase(TEST_API_BASE), TEST_API_BASE);
  assert.equal(resolveApiBase("https://evil.example"), DEFAULT_API_BASE);
});

test("returns the entries when the API has scores", async () => {
  const fetchImpl = async () => json(200, { entries: [{ rank: 1, name: "A", score: 5 }] });
  const state = await loadLeaderboard({ fetchImpl });
  assert.equal(state.kind, "ok");
  assert.equal(state.entries.length, 1);
});

test("an empty list is 'no scores yet', not offline", async () => {
  const state = await loadLeaderboard({ fetchImpl: async () => json(200, { entries: [] }) });
  assert.equal(state.kind, "empty");
  assert.equal(state.message, "No scores yet");
});

test("a 401 is a sign-in prompt, not offline", async () => {
  const state = await loadLeaderboard({ fetchImpl: async () => json(401, { error: "login required" }) });
  assert.equal(state.kind, "signin");
});

test("a real network failure is offline", async () => {
  const state = await loadLeaderboard({ fetchImpl: async () => { throw new TypeError("Failed to fetch"); } });
  assert.equal(state.kind, "offline");
});

test("a server error is an error, not offline", async () => {
  const state = await loadLeaderboard({ fetchImpl: async () => json(500, {}) });
  assert.equal(state.kind, "error");
});

test("a malformed body is an error, not offline", async () => {
  const state = await loadLeaderboard({ fetchImpl: async () => json(200, { nope: true }) });
  assert.equal(state.kind, "error");
});

test("builds the URL from base, game and limit, with credentials included", async () => {
  let seen;
  const fetchImpl = async (url, init) => { seen = { url, init }; return json(200, { entries: [] }); };
  await loadLeaderboard({ apiBase: TEST_API_BASE, game: "snake", limit: 5, fetchImpl });
  assert.equal(seen.url, `${TEST_API_BASE}/api/leaderboard?game=snake&limit=5`);
  assert.equal(seen.init.credentials, "include");
});
