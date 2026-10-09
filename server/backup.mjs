import { openCli } from "./cli.mjs";

const { config, store } = openCli();
try {
  store.migrate();
  const file = store.backupNow();
  process.stdout.write(`backup=${file} site=${config.site}\n`);
} catch (err) {
  process.stderr.write(`${err.message}\n`);
  process.exit(1);
}
