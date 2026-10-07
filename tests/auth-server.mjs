import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
process.env.PORT ||= "4173";
process.env.PLAYADDA_AUTH_SECRET ||= "playadda-test-only-session-secret";
process.env.PLAYADDA_AUTH_USERS_JSON ||= resolve(here, "fixtures/users.json");
process.env.PLAYADDA_SCORES_JSON ||= resolve(here, "../test-results/scores.json");
mkdirSync(dirname(process.env.PLAYADDA_SCORES_JSON), { recursive: true });
await import("../server/auth.mjs");
