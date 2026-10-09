import { readdirSync } from "node:fs";
import { join } from "node:path";
import { openCli } from "./cli.mjs";
import { verifyBackup } from "./users-store.mjs";

const { config } = openCli();
const args = process.argv.slice(2).filter((arg) => arg !== "--");
let files = args;
if (files.length === 0) {
  try {
    files = readdirSync(config.backupDir)
      .filter((name) => /^users-(prod|test)-.*\.json$/.test(name))
      .sort()
      .map((name) => join(config.backupDir, name));
  } catch {
    process.stderr.write(`no backups in ${config.backupDir}\n`);
    process.exit(1);
  }
}
if (files.length === 0) {
  process.stderr.write(`no backups in ${config.backupDir}\n`);
  process.exit(1);
}
let failed = 0;
for (const file of files) {
  try {
    const result = verifyBackup(file, config.encKey);
    process.stdout.write(`ok site=${result.site} users=${result.names.length} file=${file}\n`);
  } catch (err) {
    failed += 1;
    process.stderr.write(`fail file=${file} reason=${err.message}\n`);
  }
}
process.exit(failed ? 1 : 0);
