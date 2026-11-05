export const DEFAULT_LIMIT = 10;
export const MAX_LIMIT = 50;
const MAX_GAME_LENGTH = 40;

function parseLimit(raw) {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

function scoreFor(entry, game) {
  const value = game
    ? (entry.games && Object.hasOwn(entry.games, game) ? entry.games[game] : 0)
    : entry.best;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

// Pure and read-only: builds a public ranking (rank, name, score) from the
// scores document. Nothing else from a user record is ever copied out.
export function publicLeaderboard(data, params) {
  const game = String(params.get("game") || "").slice(0, MAX_GAME_LENGTH);
  const limit = parseLimit(params.get("limit"));
  const users = data && typeof data.users === "object" && data.users ? data.users : {};
  const entries = Object.entries(users)
    .map(([id, entry]) => ({
      name: String((entry && entry.name) || id),
      score: scoreFor(entry || {}, game),
    }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((row, index) => ({ rank: index + 1, name: row.name, score: row.score }));
  return { game: game || null, limit, entries };
}
