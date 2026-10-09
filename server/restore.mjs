import { openCli } from "./cli.mjs";
import { applyRestore, planRestore } from "./users-store.mjs";

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  process.stdout.write("usage: node server/restore.mjs [--apply] [backup.json]\nDry run unless --apply is set. Refuses a backup whose site does not match this instance.\n");
  process.exit(0);
}
const apply = args.includes("--apply");
const fileArg = args.find((arg) => arg !== "--apply");
const { config, store } = openCli();
const file = fileArg || store.listBackups().at(-1);
if (!file) {
  process.stderr.write(`no backups in ${config.backupDir}\n`);
  process.exit(1);
}
try {
  const plan = planRestore({
    file,
    targetSite: config.site,
    encKey: config.encKey,
    usersPath: config.usersPath,
  });
  process.stdout.write(`backup=${plan.file}\n`);
  process.stdout.write(`site=${plan.site}\n`);
  process.stdout.write(`createdAt=${plan.createdAt || ""}\n`);
  process.stdout.write(`users=${plan.names.join(",")}\n`);
  process.stdout.write(`current=${plan.currentNames.join(",")}\n`);
  if (!apply) {
    process.stdout.write("dry run: no files written\n");
    process.exit(0);
  }
  const applied = applyRestore({ file, store });
  if (applied.preRestore) process.stdout.write(`pre-restore=${applied.preRestore}\n`);
  process.stdout.write(`applied users=${config.usersPath}\n`);
} catch (err) {
  process.stderr.write(`${err.message}\n`);
  process.exit(err.code === "SITE_MISMATCH" ? 2 : 1);
}
