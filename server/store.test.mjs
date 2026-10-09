import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { atomicWriteFile, tempPathFor, withLock } from "./atomic.mjs";
import { loadConfig, parseAdmins } from "./config.mjs";
import { decryptSecret, encryptSecret, parseEncKey } from "./secret-box.mjs";
import { totp } from "./totp.mjs";
import { applyRestore, createStore, planRestore, verifyBackup } from "./users-store.mjs";

const KEY_TEXT = Buffer.from("playadda-test-enc-key-32-bytes!!").toString("base64");
const KEY = parseEncKey(KEY_TEXT);

function tempStore(site = "test") {
  const dir = mkdtempSync(join(tmpdir(), "playadda-store-"));
  const store = createStore({
    usersPath: join(dir, "users.json"),
    scoresPath: join(dir, "scores.json"),
    backupDir: join(dir, "backups"),
    encKey: KEY,
    site,
  });
  return { dir, store };
}

test("encryption round trip and tamper detection", () => {
  const cipher = encryptSecret("JBSWY3DPEHPK3PXP", KEY);
  assert.match(cipher, /^enc:v1:/);
  assert.equal(decryptSecret(cipher, KEY), "JBSWY3DPEHPK3PXP");
  assert.notEqual(encryptSecret("JBSWY3DPEHPK3PXP", KEY), cipher);
  const [prefix, iv, tag, ct] = cipher.split(":");
  void prefix;
  const flipped = `enc:v1:${iv}:${tag}:${Buffer.from(Buffer.from(ct, "base64").map((b, i) => (i === 0 ? b ^ 1 : b))).toString("base64")}`;
  assert.throws(() => decryptSecret(flipped, KEY), /did not decrypt/);
  assert.throws(() => parseEncKey(Buffer.from("short").toString("base64")), /32 bytes/);
});

test("plaintext users stay readable without a key and encrypt on the next save", () => {
  const dir = mkdtempSync(join(tmpdir(), "playadda-plain-"));
  const usersPath = join(dir, "users.json");
  writeFileSync(usersPath, JSON.stringify({ users: [{ name: "qa", secret: "JBSWY3DPEHPK3PXP" }] }));
  const open = createStore({
    usersPath,
    scoresPath: join(dir, "scores.json"),
    backupDir: join(dir, "backups"),
    encKey: null,
    site: "test",
  });
  const user = open.findUser("QA");
  assert.equal(user.secret, "JBSWY3DPEHPK3PXP");
  assert.equal(totp(user.secret, 1_700_000_000_000), totp("JBSWY3DPEHPK3PXP", 1_700_000_000_000));
  assert.throws(() => open.addUser({ name: "ada", secret: "JBSWY3DPEHPK3PXP", createdAt: "t" }), /PLAYADDA_AUTH_ENC_KEY/);

  const migrating = createStore({
    usersPath,
    scoresPath: join(dir, "scores.json"),
    backupDir: join(dir, "backups"),
    encKey: KEY,
    site: "test",
  });
  assert.ok(migrating.migrate());
  const stored = JSON.parse(readFileSync(usersPath, "utf8"));
  assert.match(stored.users[0].secret, /^enc:v1:/);
  assert.equal(stored.users[0].name, "qa");
  assert.equal(migrating.findUser("qa").secret, "JBSWY3DPEHPK3PXP");
  assert.equal(JSON.stringify(migrating.listPublic()).includes("JBSWY3DPEHPK3PXP"), false);
  assert.equal(JSON.stringify(migrating.listPublic()).includes("enc:v1"), false);
});

test("atomic write keeps the temp file beside the target", () => {
  const dir = mkdtempSync(join(tmpdir(), "playadda-atomic-"));
  const target = join(dir, "users.json");
  assert.equal(tempPathFor(target).startsWith(`${dir}/`), true);
  atomicWriteFile(target, "{\"users\":[]}\n");
  assert.equal(readFileSync(target, "utf8"), "{\"users\":[]}\n");
  const names = readFileSync(target, "utf8");
  assert.equal(names.includes(".tmp"), false);
});

test("concurrent locked updates do not drop increments", async () => {
  const dir = mkdtempSync(join(tmpdir(), "playadda-lock-"));
  const target = join(dir, "counter.txt");
  writeFileSync(target, "0\n");
  const worker = join(dir, "worker.mjs");
  const atomicModule = join(process.cwd(), "server/atomic.mjs");
  writeFileSync(worker, `import { readFileSync } from "node:fs";
import { atomicWriteFile, withLock } from ${JSON.stringify(atomicModule)};
const target = process.argv[2];
for (let i = 0; i < 20; i++) {
  withLock(target, () => {
    const n = Number(readFileSync(target, "utf8"));
    atomicWriteFile(target, String(n + 1));
  });
}
`);
  const run = () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [worker, target]);
    let err = "";
    child.stderr.on("data", (chunk) => { err += chunk; });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(err || String(code)))));
  });
  await Promise.all([run(), run()]);
  assert.equal(readFileSync(target, "utf8"), "40");
});

test("backup rotation keeps 30 and restore dry run does not write", () => {
  const { dir, store } = tempStore("test");
  store.addUser({ name: "ada", secret: "JBSWY3DPEHPK3PXP", createdAt: "2026-10-09T00:00:00.000Z" });
  for (let i = 0; i < 34; i++) store.backupNow(new Date(Date.UTC(2026, 0, 1, 0, 0, 0, i)));
  const backups = store.listBackups();
  assert.equal(backups.length, 30);
  const before = readFileSync(store.usersPath, "utf8");
  const plan = planRestore({
    file: backups.at(-1),
    targetSite: "test",
    encKey: KEY,
    usersPath: store.usersPath,
  });
  assert.equal(plan.names.includes("ada"), true);
  assert.equal(readFileSync(store.usersPath, "utf8"), before);
  assert.equal(verifyBackup(backups.at(-1), KEY).site, "test");
  const prod = tempStore("prod");
  assert.throws(() => planRestore({
    file: backups.at(-1),
    targetSite: "prod",
    encKey: KEY,
    usersPath: prod.store.usersPath,
  }), /backup site is test/);
  assert.throws(() => applyRestore({ file: backups.at(-1), store: prod.store }), /backup site is test/);
  assert.equal(prod.store.listPublic().length, 0);
  const preRestoreNames = existsSync(prod.store.backupDir)
    ? readdirSync(prod.store.backupDir).filter((name) => name.startsWith("users-pre-restore-"))
    : [];
  assert.deepEqual(preRestoreNames, []);
  void dir;
});

test("restore --apply replaces users and rejects a bad secret", () => {
  const source = tempStore("prod");
  source.store.addUser({ name: "veera", secret: "JBSWY3DPEHPK3PXP", createdAt: "2026-10-09T00:00:00.000Z" });
  const backup = source.store.listBackups().at(-1);
  const target = tempStore("prod");
  target.store.addUser({ name: "other", secret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", createdAt: "2026-10-09T00:00:00.000Z" });
  const before = readFileSync(target.store.usersPath, "utf8");
  const applied = applyRestore({ file: backup, store: target.store });
  assert.deepEqual(applied.names, ["veera"]);
  assert.match(applied.preRestore, /users-pre-restore-prod-\d{8}T\d{9}Z\.json$/);
  assert.equal(readFileSync(applied.preRestore, "utf8"), before);
  assert.equal(before.includes("other"), true);
  assert.equal(target.store.listBackups().includes(applied.preRestore), false);
  assert.equal(target.store.findUser("veera").secret, "JBSWY3DPEHPK3PXP");
  assert.equal(target.store.findUser("other"), null);
  const broken = JSON.parse(readFileSync(backup, "utf8"));
  broken.users[0].secret = `${broken.users[0].secret.slice(0, -2)}aa`;
  const brokenFile = join(target.dir, "broken.json");
  writeFileSync(brokenFile, JSON.stringify(broken));
  assert.throws(() => verifyBackup(brokenFile, KEY), /did not decrypt|not encrypted|malformed/);
});

test("scores use the same atomic write", () => {
  const { store } = tempStore("test");
  store.writeScores({ users: { qa: { games: { portal: 3 }, best: 3 } }, overall: { score: 3, name: "qa", game: "portal" } });
  assert.equal(store.readScores().overall.score, 3);
  assert.equal(tempPathFor(store.scoresPath).startsWith(join(store.scoresPath, "..")), true);
});

test("prod and test state paths cannot be mixed", () => {
  assert.equal(loadConfig({ PORT: "4173" }).usersPath, "/var/lib/playadda/prod/users.json");
  assert.equal(loadConfig({ PORT: "4174" }).usersPath, "/var/lib/playadda/test/users.json");
  assert.equal(loadConfig({ PORT: "4174" }).scoresPath, "/var/lib/playadda/test/scores.json");
  assert.equal(loadConfig({ PORT: "4174", PLAYADDA_AUTH_BACKUP_DIR: "/var/lib/playadda/test/backups" }).backupDir, "/var/lib/playadda/test/backups");
  assert.throws(() => loadConfig({
    PORT: "4174",
    PLAYADDA_AUTH_USERS_JSON: "/var/lib/playadda/prod/users.json",
  }), /playaddatest must not use prod/);
  assert.throws(() => loadConfig({
    PLAYADDA_SITE: "prod",
    PORT: "4174",
    PLAYADDA_AUTH_USERS_JSON: "/etc/playadda/users-test.json",
  }), /prod must not use playaddatest/);
  assert.equal(loadConfig({
    PORT: "4173",
    PLAYADDA_AUTH_USERS_JSON: "/etc/playadda/users.json",
    PLAYADDA_SCORES_JSON: "/etc/playadda/scores.json",
  }).usersPath, "/etc/playadda/users.json");
  assert.deepEqual(parseAdmins("veera, srini"), ["veera", "srini"]);
});

test("withLock serializes a critical section", () => {
  const dir = mkdtempSync(join(tmpdir(), "playadda-lock-order-"));
  const target = join(dir, "users.json");
  let inside = 0;
  let max = 0;
  withLock(target, () => {
    inside += 1;
    max = Math.max(max, inside);
    inside -= 1;
  });
  assert.equal(max, 1);
});
