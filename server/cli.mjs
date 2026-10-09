import { loadConfig } from "./config.mjs";
import { createStore } from "./users-store.mjs";

export function openCli() {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
  if (!config.encKey) {
    process.stderr.write("PLAYADDA_AUTH_ENC_KEY is not set\n");
    process.exit(1);
  }
  return { config, store: createStore(config) };
}
