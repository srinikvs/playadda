import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync } from "node:fs";
import { basename, join } from "node:path";
import { randomBytes } from "node:crypto";
import { atomicWriteFile, withLock } from "./atomic.mjs";
import { decryptSecret, encryptSecret, isEncryptedSecret } from "./secret-box.mjs";

const KEEP_BACKUPS = 30;
const BACKUP_RE = /^users-(prod|test)-\d{8}T\d{9}Z-[0-9a-f]{4}\.json$/;

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    if (err && err.code === "ENOENT") return null;
    const wrapped = new Error(`${basename(file)} is not valid JSON`);
    wrapped.code = "BAD_JSON";
    throw wrapped;
  }
}

function userList(raw) {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : raw.users;
  if (!Array.isArray(list)) {
    const err = new Error("users file must be a JSON array or {users:[...]}");
    err.code = "BAD_JSON";
    throw err;
  }
  return list.map((user) => ({ ...user }));
}

function keyError() {
  const err = new Error("PLAYADDA_AUTH_ENC_KEY is not set");
  err.code = "ENC_KEY_MISSING";
  err.status = 503;
  return err;
}

export function createStore({ usersPath, scoresPath, backupDir, encKey, site, now = () => new Date() }) {
  function backupName(date = now()) {
    const when = date instanceof Date ? date : new Date(date);
    const iso = when.toISOString();
    const compact = `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}T${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}${String(when.getUTCMilliseconds()).padStart(3, "0")}Z`;
    return `users-${site}-${compact}-${randomBytes(2).toString("hex")}.json`;
  }

  function readUsersRaw() {
    return userList(readJson(usersPath));
  }

  function encryptUser(user) {
    const secret = user.secret == null ? "" : String(user.secret);
    if (!secret) return { ...user, secret };
    if (isEncryptedSecret(secret)) return { ...user, secret };
    if (!encKey) throw keyError();
    return { ...user, secret: encryptSecret(secret, encKey) };
  }

  function decryptUser(user) {
    const secret = user.secret == null ? "" : String(user.secret);
    if (!secret || !isEncryptedSecret(secret)) return { ...user, secret, locked: false };
    try {
      return { ...user, secret: decryptSecret(secret, encKey), locked: false };
    } catch (err) {
      return { ...user, secret: "", locked: true, lockError: err.code || "ENC_DECRYPT" };
    }
  }

  function listBackupFiles() {
    if (!existsSync(backupDir)) return [];
    return readdirSync(backupDir)
      .filter((name) => BACKUP_RE.test(name))
      .map((name) => join(backupDir, name))
      .sort();
  }

  function rotateBackups() {
    const files = listBackupFiles();
    const extra = files.length - KEEP_BACKUPS;
    for (let i = 0; i < extra; i++) unlinkSync(files[i]);
  }

  function writeBackup(encryptedUsers, date = now()) {
    mkdirSync(backupDir, { recursive: true, mode: 0o750 });
    const createdAt = (date instanceof Date ? date : new Date(date)).toISOString();
    const file = join(backupDir, backupName(date));
    const body = {
      site,
      createdAt,
      users: encryptedUsers.map((user) => ({ ...user })),
    };
    atomicWriteFile(file, `${JSON.stringify(body, null, 2)}\n`);
    rotateBackups();
    return file;
  }

  function writeUsers(encryptedUsers) {
    atomicWriteFile(usersPath, `${JSON.stringify({ users: encryptedUsers }, null, 2)}\n`);
  }

  function compactStamp(date = now()) {
    const when = date instanceof Date ? date : new Date(date);
    const iso = when.toISOString();
    return `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}T${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}${String(when.getUTCMilliseconds()).padStart(3, "0")}Z`;
  }

  function copyCurrentUsers(date = now()) {
    if (!existsSync(usersPath)) return null;
    mkdirSync(backupDir, { recursive: true, mode: 0o750 });
    const file = join(backupDir, `users-pre-restore-${site}-${compactStamp(date)}.json`);
    atomicWriteFile(file, readFileSync(usersPath, "utf8"));
    return file;
  }

  function saveEncrypted(encryptedUsers, date = now(), { preserveCurrent = false } = {}) {
    return withLock(usersPath, () => {
      const preRestore = preserveCurrent ? copyCurrentUsers(date) : null;
      writeUsers(encryptedUsers);
      const backup = writeBackup(encryptedUsers, date);
      return preserveCurrent ? { backup, preRestore } : backup;
    });
  }

  function loadPlain() {
    return readUsersRaw().map(decryptUser);
  }

  function hasPlaintext() {
    return readUsersRaw().some((user) => user.secret && !isEncryptedSecret(String(user.secret)));
  }

  function migrate() {
    if (!encKey || !existsSync(usersPath) || !hasPlaintext()) return null;
    const plain = loadPlain();
    if (plain.some((user) => user.locked)) return null;
    const encrypted = plain.map(encryptUser);
    return saveEncrypted(encrypted);
  }

  function requireKey() {
    if (!encKey) throw keyError();
  }

  function nameKey(name) {
    return String(name || "").trim().toLowerCase();
  }

  return {
    site,
    usersPath,
    scoresPath,
    backupDir,
    hasEncKey() {
      return Boolean(encKey);
    },
    migrate,
    listPublic() {
      return loadPlain()
        .filter((user) => String(user.name || "").trim())
        .map((user) => ({
          name: String(user.name).trim(),
          ...(user.createdAt ? { createdAt: user.createdAt } : {}),
        }));
    },
    findUser(name) {
      const key = nameKey(name);
      return loadPlain().find((user) => String(user.name || "").trim().toLowerCase() === key) || null;
    },
    addUser({ name, secret, createdAt }) {
      requireKey();
      const key = nameKey(name);
      return withLock(usersPath, () => {
        const current = readUsersRaw();
        if (current.some((user) => String(user.name || "").trim().toLowerCase() === key)) {
          const err = new Error("That name is already enrolled");
          err.status = 409;
          throw err;
        }
        const next = current.map(encryptUser);
        next.push(encryptUser({ name: String(name).trim(), secret, createdAt }));
        writeUsers(next);
        return writeBackup(next);
      });
    },
    removeUser(name) {
      requireKey();
      const key = nameKey(name);
      return withLock(usersPath, () => {
        const current = readUsersRaw();
        const next = current.filter((user) => String(user.name || "").trim().toLowerCase() !== key);
        if (next.length === current.length) {
          const err = new Error("No such user");
          err.status = 404;
          throw err;
        }
        const encrypted = next.map(encryptUser);
        writeUsers(encrypted);
        return writeBackup(encrypted);
      });
    },
    backupNow(date = now()) {
      requireKey();
      return withLock(usersPath, () => {
        const plaintext = hasPlaintext();
        const current = readUsersRaw().map(encryptUser);
        if (plaintext) writeUsers(current);
        return writeBackup(current, date);
      });
    },
    openSecret(stored) {
      return decryptSecret(stored, encKey);
    },
    replaceUsers(plainUsers) {
      requireKey();
      const encrypted = plainUsers.map((user) => encryptUser({ ...user, secret: user.secret }));
      return saveEncrypted(encrypted, now(), { preserveCurrent: true });
    },
    listBackups() {
      return listBackupFiles();
    },
    readScores() {
      if (!scoresPath || !existsSync(scoresPath)) {
        return { users: {}, overall: { score: 0, name: "", game: "" } };
      }
      const raw = readJson(scoresPath) || {};
      raw.users ||= {};
      raw.overall ||= { score: 0, name: "", game: "" };
      return raw;
    },
    writeScores(data) {
      withLock(scoresPath, () => {
        atomicWriteFile(scoresPath, `${JSON.stringify(data, null, 2)}\n`);
      });
    },
  };
}

export function readBackup(file) {
  let raw;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    const err = new Error(`${basename(file)} is not valid JSON`);
    err.code = "BAD_JSON";
    throw err;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    const err = new Error(`${basename(file)} must be a JSON object`);
    err.code = "BAD_SHAPE";
    throw err;
  }
  if (raw.site !== "prod" && raw.site !== "test") {
    const err = new Error(`${basename(file)} is missing site (prod or test)`);
    err.code = "BAD_SHAPE";
    throw err;
  }
  if (!Array.isArray(raw.users)) {
    const err = new Error(`${basename(file)} is missing a users array`);
    err.code = "BAD_SHAPE";
    throw err;
  }
  raw.users.forEach((user, index) => {
    if (!user || typeof user !== "object" || !String(user.name || "").trim() || typeof user.secret !== "string" || !user.secret) {
      const err = new Error(`${basename(file)} user ${index + 1} must have a name and a secret`);
      err.code = "BAD_SHAPE";
      throw err;
    }
  });
  return raw;
}

export function verifyBackup(file, encKey) {
  const doc = readBackup(file);
  if (!encKey) {
    const err = new Error("PLAYADDA_AUTH_ENC_KEY is not set");
    err.code = "ENC_KEY_MISSING";
    throw err;
  }
  const names = [];
  for (const user of doc.users) {
    const name = String(user.name).trim();
    if (!isEncryptedSecret(user.secret)) {
      const err = new Error(`user ${name}: secret is not encrypted`);
      err.code = "ENC_PLAINTEXT";
      throw err;
    }
    decryptSecret(user.secret, encKey);
    names.push(name);
  }
  return { file, site: doc.site, createdAt: doc.createdAt || null, names };
}

export function planRestore({ file, targetSite, encKey, usersPath }) {
  const verified = verifyBackup(file, encKey);
  if (verified.site !== targetSite) {
    const err = new Error(`refusing restore: backup site is ${verified.site} and this instance is ${targetSite}`);
    err.code = "SITE_MISMATCH";
    throw err;
  }
  let currentNames = [];
  if (existsSync(usersPath)) {
    try {
      currentNames = userList(readJson(usersPath)).map((user) => String(user.name || "").trim()).filter(Boolean);
    } catch {
      currentNames = [];
    }
  }
  return {
    file,
    site: verified.site,
    createdAt: verified.createdAt,
    names: verified.names,
    currentNames,
    usersPath,
  };
}

export function applyRestore({ file, store }) {
  const doc = readBackup(file);
  if (doc.site !== store.site) {
    const err = new Error(`refusing restore: backup site is ${doc.site} and this instance is ${store.site}`);
    err.code = "SITE_MISMATCH";
    throw err;
  }
  const plainUsers = doc.users.map((user) => {
    if (!isEncryptedSecret(user.secret)) {
      const err = new Error(`user ${String(user.name).trim()}: secret is not encrypted`);
      err.code = "ENC_PLAINTEXT";
      throw err;
    }
    return {
      ...user,
      name: String(user.name).trim(),
      secret: store.openSecret(user.secret),
    };
  });
  const saved = store.replaceUsers(plainUsers);
  return {
    file,
    site: doc.site,
    createdAt: doc.createdAt || null,
    names: plainUsers.map((user) => user.name),
    applied: true,
    usersPath: store.usersPath,
    preRestore: saved.preRestore || null,
  };
}
