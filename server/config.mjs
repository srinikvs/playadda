import { dirname, join, resolve, sep } from "node:path";
import { parseEncKey } from "./secret-box.mjs";

export function parseAdmins(raw) {
  return String(raw || "")
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

export function resolveSite(env = process.env) {
  const explicit = String(env.PLAYADDA_SITE || "").trim().toLowerCase();
  if (explicit === "prod" || explicit === "production") return "prod";
  if (explicit === "test" || explicit === "playaddatest") return "test";
  return Number(env.PORT || 4173) === 4174 ? "test" : "prod";
}

export function stateDirFor(site) {
  return site === "test" ? "/var/lib/playadda/test" : "/var/lib/playadda/prod";
}

function under(root, file) {
  const abs = resolve(file);
  const base = resolve(root);
  return abs === base || abs.startsWith(base + sep);
}

export function assertSiteIsolation(site, paths) {
  const prodRoot = "/var/lib/playadda/prod";
  const testRoot = "/var/lib/playadda/test";
  const prodFiles = new Set(["/etc/playadda/users.json", "/etc/playadda/scores.json"]);
  for (const file of paths) {
    if (!file) continue;
    const abs = resolve(file);
    if (site === "test" && (under(prodRoot, abs) || prodFiles.has(abs))) {
      throw new Error(`playaddatest must not use prod state (${abs})`);
    }
    if (site === "prod" && (under(testRoot, abs) || abs.endsWith(`${sep}users-test.json`) || abs.endsWith(`${sep}scores-test.json`))) {
      throw new Error(`prod must not use playaddatest state (${abs})`);
    }
  }
}

export function loadConfig(env = process.env) {
  const site = resolveSite(env);
  const root = stateDirFor(site);
  const usersPath = env.PLAYADDA_AUTH_USERS_JSON || join(root, "users.json");
  const scoresPath = env.PLAYADDA_SCORES_JSON || join(root, "scores.json");
  const backupDir = env.PLAYADDA_AUTH_BACKUP_DIR || join(dirname(usersPath), "backups");
  assertSiteIsolation(site, [usersPath, scoresPath, backupDir]);
  let encKey = null;
  const encRaw = String(env.PLAYADDA_AUTH_ENC_KEY || "").trim();
  if (encRaw) encKey = parseEncKey(encRaw);
  return {
    site,
    port: Number(env.PORT || (site === "test" ? 4174 : 4173)),
    sessionSecret: env.PLAYADDA_AUTH_SECRET || "",
    usersPath,
    scoresPath,
    backupDir,
    encKey,
    admins: parseAdmins(env.PLAYADDA_AUTH_ADMINS),
    ttlSec: Number(env.PLAYADDA_SESSION_TTL || 60 * 60 * 12),
  };
}
