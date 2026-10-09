import { createHmac, timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import http from "node:http";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyTotp } from "./totp.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const port = Number(process.env.PORT || 4173);
const sessionSecret = process.env.PLAYADDA_AUTH_SECRET || "";
const usersPath = process.env.PLAYADDA_AUTH_USERS_JSON || "/etc/playadda/users.json";
const scoresPath = process.env.PLAYADDA_SCORES_JSON || "/etc/playadda/scores.json";
const ttlSec = Number(process.env.PLAYADDA_SESSION_TTL || 60 * 60 * 12);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
};

function loadUsers() {
  if (!existsSync(usersPath)) return [];
  const raw = JSON.parse(readFileSync(usersPath, "utf8"));
  const list = Array.isArray(raw) ? raw : raw.users || [];
  return list.map((u) => ({ name: String(u.name || "").trim(), secret: String(u.secret || "").trim() })).filter((u) => u.name && u.secret);
}

function findUser(name) {
  const key = String(name || "").trim().toLowerCase();
  return loadUsers().find((u) => u.name.toLowerCase() === key) || null;
}

function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

function sign(payload) {
  const body = b64url(JSON.stringify(payload));
  const mac = createHmac("sha256", sessionSecret).update(body).digest("base64url");
  return `${body}.${mac}`;
}

function readSession(req) {
  if (!sessionSecret) return null;
  const cookie = String(req.headers.cookie || "");
  const match = cookie.match(/(?:^|; )playadda_session=([^;]+)/);
  if (!match) return null;
  const [body, mac] = decodeURIComponent(match[1]).split(".");
  if (!body || !mac) return null;
  const expected = createHmac("sha256", sessionSecret).update(body).digest("base64url");
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

function readScores() {
  if (!existsSync(scoresPath)) return { users: {}, overall: { score: 0, name: "", game: "" } };
  const raw = JSON.parse(readFileSync(scoresPath, "utf8"));
  raw.users ||= {};
  raw.overall ||= { score: 0, name: "", game: "" };
  return raw;
}

function writeScores(data) {
  mkdirSync(dirname(scoresPath), { recursive: true });
  writeFileSync(scoresPath, JSON.stringify(data, null, 2));
}

function publicScores(session) {
  const data = readScores();
  const mine = data.users[session.name.toLowerCase()] || { games: {}, best: 0 };
  return {
    name: session.name,
    games: mine.games || {},
    best: mine.best || 0,
    overall: data.overall || { score: 0, name: "", game: "" },
  };
}

function send(res, status, body, extra = {}) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", ...extra });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try { resolveBody(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); }
      catch { reject(new Error("bad json")); }
    });
    req.on("error", reject);
  });
}

function safeFile(urlPath) {
  let path = decodeURIComponent(urlPath.split("?")[0] || "/");
  if (path.endsWith("/")) path += "index.html";
  const file = resolve(root, normalize(path).replace(/^([/\\])+/, ""));
  if (file !== root && !file.startsWith(root + sep)) return null;
  return file;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  if (url.pathname === "/api/auth/login" && req.method === "POST") {
    if (!sessionSecret) return send(res, 503, { error: "auth secret not configured" });
    let body;
    try { body = await readBody(req); } catch { return send(res, 400, { error: "Invalid request" }); }
    const user = findUser(body.name);
    const ok = user && verifyTotp(user.secret, body.code);
    if (!ok) return send(res, 401, { error: "Name or authenticator code is wrong" });
    const token = sign({ name: user.name, exp: Date.now() + ttlSec * 1000 });
    return send(res, 200, { name: user.name }, {
      "set-cookie": `playadda_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${ttlSec}`,
    });
  }
  if (url.pathname === "/api/auth/logout" && req.method === "POST") {
    return send(res, 200, { ok: true }, { "set-cookie": "playadda_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0" });
  }
  if (url.pathname === "/api/auth/session" && req.method === "GET") {
    const session = readSession(req);
    if (!session) return send(res, 401, { error: "login required" });
    return send(res, 200, { name: session.name });
  }
  if (url.pathname === "/api/scores" && req.method === "GET") {
    const session = readSession(req);
    if (!session) return send(res, 401, { error: "login required" });
    return send(res, 200, publicScores(session));
  }
  if (url.pathname === "/api/scores" && req.method === "POST") {
    const session = readSession(req);
    if (!session) return send(res, 401, { error: "login required" });
    let body;
    try { body = await readBody(req); } catch { return send(res, 400, { error: "Invalid request" }); }
    const game = String(body.game || "portal").slice(0, 40);
    const score = Number(body.score);
    if (!Number.isFinite(score) || score < 0) return send(res, 400, { error: "Invalid score" });
    const data = readScores();
    const id = session.name.toLowerCase();
    const mine = data.users[id] || { games: {}, best: 0 };
    mine.games[game] = Math.max(mine.games[game] || 0, score);
    mine.best = Math.max(mine.best || 0, ...Object.values(mine.games));
    data.users[id] = mine;
    if (score > (data.overall.score || 0)) data.overall = { score, name: session.name, game };
    writeScores(data);
    return send(res, 200, publicScores(session));
  }
  const file = safeFile(url.pathname);
  if (!file || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("not found");
    return;
  }
  res.writeHead(200, { "content-type": mime[extname(file)] || "application/octet-stream" });
  createReadStream(file).pipe(res);
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`playadda auth server http://127.0.0.1:${port}/\n`);
});
