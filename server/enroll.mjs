import { randomBytes } from "node:crypto";
import { base32Encode, verifyTotp } from "./totp.mjs";
import { qrSvg } from "./qr.mjs";

const DEFAULT_TTL_MS = 10 * 60 * 1000;

export function normalizeName(raw) {
  const name = String(raw ?? "").trim();
  if (!name || name.length > 64) {
    const err = new Error("Enter a name up to 64 characters");
    err.status = 400;
    throw err;
  }
  if (/[\u0000-\u001f\u007f]/.test(name)) {
    const err = new Error("Name has invalid characters");
    err.status = 400;
    throw err;
  }
  return name;
}

export function otpauthUrl(name, secret) {
  return `otpauth://totp/Playadda:${encodeURIComponent(name)}?secret=${encodeURIComponent(secret)}&issuer=Playadda`;
}

function fail(message, status) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

export function createEnrollment({
  store,
  now = () => Date.now(),
  ttlMs = DEFAULT_TTL_MS,
  random = randomBytes,
}) {
  const pending = new Map();

  function purge(time) {
    for (const [key, row] of pending) {
      if (row.expiresAt <= time) pending.delete(key);
    }
  }

  return {
    begin(rawName) {
      if (!store.hasEncKey()) fail("PLAYADDA_AUTH_ENC_KEY is not set", 503);
      const name = normalizeName(rawName);
      const key = name.toLowerCase();
      const existing = store.findUser(key);
      if (existing) fail("That name is already enrolled", 409);
      const time = now();
      purge(time);
      const secret = base32Encode(random(20));
      if (secret.length < 32) fail("could not generate a secret", 500);
      pending.set(key, { name, secret, expiresAt: time + ttlMs });
      const otpauth = otpauthUrl(name, secret);
      return {
        name,
        secret,
        otpauth,
        qrSvg: qrSvg(otpauth),
        expiresAt: new Date(time + ttlMs).toISOString(),
      };
    },
    confirm(rawName, code) {
      const name = normalizeName(rawName);
      const key = name.toLowerCase();
      const time = now();
      purge(time);
      const row = pending.get(key);
      if (!row) fail("Setup expired or was not started", 400);
      if (!verifyTotp(row.secret, code, time)) fail("Authenticator code did not match", 401);
      if (store.findUser(key)) {
        pending.delete(key);
        fail("That name is already enrolled", 409);
      }
      const createdAt = new Date(time).toISOString();
      store.addUser({ name: row.name, secret: row.secret, createdAt });
      pending.delete(key);
      return { name: row.name, createdAt };
    },
    list() {
      return store.listPublic();
    },
    remove(rawName) {
      const name = normalizeName(rawName);
      store.removeUser(name);
      pending.delete(name.toLowerCase());
      return { name };
    },
  };
}
