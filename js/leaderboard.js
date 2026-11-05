export const DEFAULT_API_BASE = "https://playadda.duckdns.org";
export const TEST_API_BASE = "https://playaddatest.duckdns.org";
const ALLOWED_API_BASES = [DEFAULT_API_BASE, TEST_API_BASE];

// Picks the API base from a configured value (window.PLAYADDA_API_BASE is set
// by the Android shell). Unknown values fall back to prod.
export function resolveApiBase(configured) {
  return ALLOWED_API_BASES.includes(configured) ? configured : DEFAULT_API_BASE;
}

// Resolves to one of: ok | empty | signin | offline | error. "offline" is only
// ever reported when fetch itself rejects (a real network failure).
export async function loadLeaderboard({ apiBase, game, limit, fetchImpl = globalThis.fetch } = {}) {
  const params = new URLSearchParams();
  if (game) params.set("game", game);
  if (limit) params.set("limit", String(limit));
  const query = params.toString();
  const url = `${resolveApiBase(apiBase)}/api/leaderboard${query ? `?${query}` : ""}`;

  let res;
  try {
    res = await fetchImpl(url, { credentials: "include" });
  } catch {
    return { kind: "offline", message: "You appear to be offline" };
  }
  if (res.status === 401) return { kind: "signin", message: "Sign in to see the leaderboard" };
  if (!res.ok) return { kind: "error", message: "Could not load the leaderboard" };

  let body;
  try {
    body = await res.json();
  } catch {
    return { kind: "error", message: "Could not load the leaderboard" };
  }
  if (!body || !Array.isArray(body.entries)) {
    return { kind: "error", message: "Could not load the leaderboard" };
  }
  if (body.entries.length === 0) return { kind: "empty", message: "No scores yet" };
  return { kind: "ok", entries: body.entries };
}
