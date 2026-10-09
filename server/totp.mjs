import { createHmac } from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Decode(input) {
  const clean = String(input || "").toUpperCase().replace(/=+$/g, "").replace(/\s/g, "");
  let bits = "";
  for (const ch of clean) {
    const val = ALPHABET.indexOf(ch);
    if (val < 0) throw new Error("invalid base32");
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export function hotp(secret, counter, digits = 6) {
  const key = Buffer.isBuffer(secret) ? secret : base32Decode(secret);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const bin = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(bin % 10 ** digits).padStart(digits, "0");
}

export function totp(secret, now = Date.now(), { step = 30, digits = 6 } = {}) {
  const counter = Math.floor(now / 1000 / step);
  return hotp(secret, counter, digits);
}

export function verifyTotp(secret, code, now = Date.now(), { step = 30, digits = 6, skew = 1 } = {}) {
  const token = String(code || "").replace(/\s/g, "");
  if (!/^[0-9]{6}$/.test(token)) return false;
  const counter = Math.floor(now / 1000 / step);
  for (let delta = -skew; delta <= skew; delta++) {
    if (hotp(secret, counter + delta, digits) === token) return true;
  }
  return false;
}
