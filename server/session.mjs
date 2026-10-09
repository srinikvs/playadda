import { createHmac, timingSafeEqual } from "node:crypto";

export function signSession(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function readSession(req, secret) {
  if (!secret) return null;
  const cookie = String(req.headers?.cookie || "");
  const match = cookie.match(/(?:^|; )playadda_session=([^;]+)/);
  if (!match) return null;
  let decoded;
  try {
    decoded = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  const [body, mac] = decoded.split(".");
  if (!body || !mac) return null;
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload?.name || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function isAdminSession(session, admins) {
  if (!session?.name) return false;
  return admins.includes(String(session.name).trim().toLowerCase());
}
