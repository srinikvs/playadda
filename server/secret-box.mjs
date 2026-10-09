import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const PREFIX = "enc:v1:";

export function parseEncKey(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  const key = Buffer.from(text, "base64");
  if (key.length !== 32) {
    throw new Error("PLAYADDA_AUTH_ENC_KEY must be base64 of exactly 32 bytes");
  }
  return key;
}

export function isEncryptedSecret(value) {
  return typeof value === "string" && value.startsWith(PREFIX);
}

export function encryptSecret(plain, key) {
  if (!key || key.length !== 32) throw new Error("PLAYADDA_AUTH_ENC_KEY must be base64 of exactly 32 bytes");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

export function decryptSecret(stored, key) {
  const value = String(stored || "");
  if (!isEncryptedSecret(value)) return value;
  if (!key) {
    const err = new Error("PLAYADDA_AUTH_ENC_KEY is not set; encrypted authenticator secrets cannot be read");
    err.code = "ENC_KEY_MISSING";
    throw err;
  }
  const parts = value.slice(PREFIX.length).split(":");
  if (parts.length !== 3) {
    const err = new Error("encrypted secret is malformed");
    err.code = "ENC_MALFORMED";
    throw err;
  }
  const [ivB64, tagB64, ctB64] = parts;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    const plain = Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]);
    return plain.toString("utf8");
  } catch {
    const err = new Error("encrypted secret did not decrypt");
    err.code = "ENC_DECRYPT";
    throw err;
  }
}
