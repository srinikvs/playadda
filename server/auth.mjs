import { createReadStream, existsSync, statSync } from "node:fs";
import http from "node:http";
import { extname, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.mjs";
import { enrollPageHtml } from "./enroll-page.mjs";
import { createEnrollment } from "./enroll.mjs";
import { isAdminSession, readSession, signSession } from "./session.mjs";
import { verifyTotp } from "./totp.mjs";
import { createStore } from "./users-store.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
};

function send(res, status, body, extra = {}) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra });
  res.end(JSON.stringify(body));
}

function sendHtml(res, status, html) {
  res.writeHead(status, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  res.end(html);
}

function readBody(req) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 65_536) {
        reject(new Error("bad json"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try { resolveBody(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); }
      catch { reject(new Error("bad json")); }
    });
    req.on("error", reject);
  });
}

function safeFile(urlPath) {
  let path = decodeURIComponent(urlPath.split("?")[0] || "/");
  if (path === "/server" || path.startsWith("/server/")) return null;
  if (path.endsWith("/")) path += "index.html";
  const file = resolve(root, normalize(path).replace(/^([/\\])+/, ""));
  if (file !== root && !file.startsWith(root + sep)) return null;
  if (file.startsWith(resolve(root, "server") + sep)) return null;
  return file;
}

function statusOf(err) {
  return Number(err.status) || (err.code === "ENC_KEY_MISSING" ? 503 : 500);
}

export function createAuthServer(config) {
  const store = createStore(config);
  const enrollment = createEnrollment({ store });

  try {
    const migrated = store.migrate();
    if (migrated) process.stderr.write(`encrypted plaintext authenticator secrets; backup written\n`);
  } catch (err) {
    process.stderr.write(`plaintext authenticator secrets were left unchanged: ${err.message}\n`);
  }

  function session(req) {
    return readSession(req, config.sessionSecret);
  }

  function requireAdmin(req, res) {
    const current = session(req);
    if (!current) {
      send(res, 401, { error: "login required" });
      return null;
    }
    if (!isAdminSession(current, config.admins)) {
      send(res, 403, { error: "admin session required" });
      return null;
    }
    return current;
  }

  function publicScores(current) {
    const data = store.readScores();
    const mine = data.users[current.name.toLowerCase()] || { games: {}, best: 0 };
    return {
      name: current.name,
      games: mine.games || {},
      best: mine.best || 0,
      overall: data.overall || { score: 0, name: "", game: "" },
    };
  }

  return http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    try {
      if (url.pathname === "/api/auth/login" && req.method === "POST") {
        if (!config.sessionSecret) return send(res, 503, { error: "auth secret not configured" });
        let body;
        try { body = await readBody(req); } catch { return send(res, 400, { error: "Invalid request" }); }
        const user = store.findUser(body.name);
        if (user?.locked) return send(res, 503, { error: "authenticator store is locked" });
        const ok = user && user.secret && verifyTotp(user.secret, body.code);
        if (!ok) return send(res, 401, { error: "Name or authenticator code is wrong" });
        const token = signSession({ name: user.name, exp: Date.now() + config.ttlSec * 1000 }, config.sessionSecret);
        return send(res, 200, { name: user.name }, {
          "set-cookie": `playadda_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${config.ttlSec}`,
        });
      }
      if (url.pathname === "/api/auth/logout" && req.method === "POST") {
        return send(res, 200, { ok: true }, { "set-cookie": "playadda_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0" });
      }
      if (url.pathname === "/api/auth/session" && req.method === "GET") {
        const current = session(req);
        if (!current) return send(res, 401, { error: "login required" });
        return send(res, 200, { name: current.name, admin: isAdminSession(current, config.admins) });
      }
      if (url.pathname === "/api/scores" && req.method === "GET") {
        const current = session(req);
        if (!current) return send(res, 401, { error: "login required" });
        return send(res, 200, publicScores(current));
      }
      if (url.pathname === "/api/scores" && req.method === "POST") {
        const current = session(req);
        if (!current) return send(res, 401, { error: "login required" });
        let body;
        try { body = await readBody(req); } catch { return send(res, 400, { error: "Invalid request" }); }
        const game = String(body.game || "portal").slice(0, 40);
        const score = Number(body.score);
        if (!Number.isFinite(score) || score < 0) return send(res, 400, { error: "Invalid score" });
        const data = store.readScores();
        const id = current.name.toLowerCase();
        const mine = data.users[id] || { games: {}, best: 0 };
        mine.games[game] = Math.max(mine.games[game] || 0, score);
        mine.best = Math.max(mine.best || 0, ...Object.values(mine.games));
        data.users[id] = mine;
        if (score > (data.overall.score || 0)) data.overall = { score, name: current.name, game };
        store.writeScores(data);
        return send(res, 200, publicScores(current));
      }
      if (url.pathname === "/admin/enroll" || url.pathname === "/admin/enroll/") {
        if (req.method !== "GET") return send(res, 405, { error: "method not allowed" });
        const current = session(req);
        if (!current) return sendHtml(res, 401, "<!DOCTYPE html><title>Sign in</title><p>Admin sign-in required.</p>");
        if (!isAdminSession(current, config.admins)) return sendHtml(res, 403, "<!DOCTYPE html><title>Forbidden</title><p>Admin session required.</p>");
        return sendHtml(res, 200, enrollPageHtml());
      }
      if (url.pathname === "/api/admin/enroll" && req.method === "POST") {
        if (!requireAdmin(req, res)) return;
        let body;
        try { body = await readBody(req); } catch { return send(res, 400, { error: "Invalid request" }); }
        return send(res, 200, enrollment.begin(body.name));
      }
      if (url.pathname === "/api/admin/enroll/confirm" && req.method === "POST") {
        if (!requireAdmin(req, res)) return;
        let body;
        try { body = await readBody(req); } catch { return send(res, 400, { error: "Invalid request" }); }
        return send(res, 200, enrollment.confirm(body.name, body.code));
      }
      if (url.pathname === "/api/admin/users" && req.method === "GET") {
        if (!requireAdmin(req, res)) return;
        return send(res, 200, { users: enrollment.list() });
      }
      if (url.pathname === "/api/admin/users/remove" && req.method === "POST") {
        if (!requireAdmin(req, res)) return;
        let body;
        try { body = await readBody(req); } catch { return send(res, 400, { error: "Invalid request" }); }
        return send(res, 200, enrollment.remove(body.name));
      }
      if (url.pathname === "/api/admin/backup" && req.method === "POST") {
        if (!requireAdmin(req, res)) return;
        const file = store.backupNow();
        return send(res, 200, { ok: true, file: file.split(sep).pop(), site: config.site });
      }
    } catch (err) {
      return send(res, statusOf(err), { error: err.message || "error" });
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
}

function shouldListen() {
  const entry = process.argv[1] ? resolve(process.argv[1]) : "";
  return entry.endsWith(`${sep}auth.mjs`) || entry.endsWith(`${sep}auth-server.mjs`);
}

if (shouldListen()) {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
  const server = createAuthServer(config);
  server.listen(config.port, "127.0.0.1", () => {
    const key = config.encKey ? "set" : "missing";
    process.stdout.write(`playadda auth site=${config.site} http://127.0.0.1:${config.port}/ encKey=${key}\n`);
  });
}
