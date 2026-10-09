import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const usersDest = resolve(here, "../test-results/users.json");
const scoresDest = resolve(here, "../test-results/scores.json");
const backupDir = resolve(here, "../test-results/backups");
mkdirSync(dirname(usersDest), { recursive: true });
mkdirSync(backupDir, { recursive: true });
copyFileSync(resolve(here, "fixtures/users.json"), usersDest);

process.env.PORT = "4173";
process.env.PLAYADDA_SITE = "test";
process.env.PLAYADDA_AUTH_SECRET ||= "playadda-test-only-session-secret";
process.env.PLAYADDA_AUTH_USERS_JSON = usersDest;
process.env.PLAYADDA_SCORES_JSON = scoresDest;
process.env.PLAYADDA_AUTH_BACKUP_DIR = backupDir;
process.env.PLAYADDA_AUTH_ENC_KEY = Buffer.from("playadda-test-enc-key-32-bytes!!").toString("base64");
process.env.PLAYADDA_AUTH_ADMINS ||= "srini";
await import("../server/auth.mjs");
