import { closeSync, fsyncSync, mkdirSync, openSync, renameSync, statSync, unlinkSync, writeSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

const STALE_MS = 30_000;

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function tempPathFor(target) {
  return join(dirname(target), `.${basename(target)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`);
}

export function lockPathFor(target) {
  return join(dirname(target), `.${basename(target)}.lock`);
}

export function atomicWriteFile(target, contents) {
  const dir = dirname(target);
  mkdirSync(dir, { recursive: true, mode: 0o750 });
  const tmp = tempPathFor(target);
  const data = typeof contents === "string" ? contents : String(contents);
  const fd = openSync(tmp, "w", 0o600);
  try {
    writeSync(fd, data);
    fsyncSync(fd);
  } catch (err) {
    try { closeSync(fd); } catch { /* ignore */ }
    try { unlinkSync(tmp); } catch { /* ignore */ }
    throw err;
  }
  closeSync(fd);
  try {
    renameSync(tmp, target);
  } catch (err) {
    try { unlinkSync(tmp); } catch { /* ignore */ }
    throw err;
  }
}

function tryStealStale(lockPath) {
  try {
    const st = statSync(lockPath);
    if (Date.now() - st.mtimeMs > STALE_MS) unlinkSync(lockPath);
  } catch {
    /* another writer removed it */
  }
}

export function withLock(target, fn) {
  const dir = dirname(target);
  mkdirSync(dir, { recursive: true, mode: 0o750 });
  const lockPath = lockPathFor(target);
  const start = Date.now();
  let fd = null;
  while (fd === null) {
    try {
      fd = openSync(lockPath, "wx", 0o600);
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
      tryStealStale(lockPath);
      if (Date.now() - start > 5_000) {
        const timeout = new Error(`timed out waiting for lock on ${basename(target)}`);
        timeout.code = "LOCK_TIMEOUT";
        throw timeout;
      }
      sleepMs(20);
    }
  }
  try {
    writeSync(fd, `${process.pid}\n`);
    return fn();
  } finally {
    try { closeSync(fd); } catch { /* ignore */ }
    try { unlinkSync(lockPath); } catch { /* ignore */ }
  }
}
