/**
 * Opens the packaged portal and each game with every non-local request aborted.
 * Run from the repo root: node android/tools/offline_smoke.mjs
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { chromium } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const androidDir = path.resolve(here, "..");
const repo = path.resolve(androidDir, "..");
const site = path.join(androidDir, "app", "build", "offline-smoke-site");

const MOUNTS = new Set([
  "tessera",
  "classic-snake",
  "mini-sudoku",
  "zip",
  "tango",
  "chassu-rider",
  "pacman",
]);
const STATIC_EXT = new Set([
  "js", "mjs", "css", "svg", "png", "jpg", "jpeg", "gif", "webp", "ico",
  "json", "map", "wasm", "woff", "woff2", "txt", "mp3", "ogg", "wav",
]);
const MIME = {
  html: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  svg: "image/svg+xml",
  json: "application/json",
  woff: "font/woff",
  woff2: "font/woff2",
  png: "image/png",
  txt: "text/plain; charset=utf-8",
};

const GAMES = [
  ["card-tessera", "app"],
  ["card-classic-snake", "start-screen"],
  ["card-mini-sudoku", "start-screen"],
  ["card-zip", "start-screen"],
  ["card-tango", "overlay"],
  ["card-chassu-rider", "start-screen"],
  ["card-pacman", "overlay"],
];

function mimeOf(file) {
  const ext = path.extname(file).slice(1).toLowerCase();
  return MIME[ext] || "application/octet-stream";
}

async function resolveFile(urlPath) {
  let rel = decodeURIComponent(urlPath.split("?")[0]);
  if (rel.startsWith("/")) rel = rel.slice(1);
  if (rel.includes("..") || rel.includes("\\")) return null;
  if (rel === "" || rel.endsWith("/")) rel += "index.html";
  const candidates = [rel, `${rel}/index.html`];
  for (const candidate of candidates) {
    const full = path.join(site, candidate);
    try {
      if ((await stat(full)).isFile()) return full;
    } catch { /* missing */ }
  }
  const mount = rel.split("/")[0];
  const ext = path.extname(rel).slice(1).toLowerCase();
  if (MOUNTS.has(mount) && !STATIC_EXT.has(ext)) {
    const spa = path.join(site, mount, "index.html");
    try {
      if ((await stat(spa)).isFile()) return spa;
    } catch { /* missing */ }
  }
  return null;
}

function startServer() {
  const server = createServer(async (req, res) => {
    const file = await resolveFile(req.url || "/");
    if (!file) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": mimeOf(file), "Cache-Control": "no-store" });
    res.end(body);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

const sync = spawnSync("python3", [
  path.join(here, "sync_web.py"),
  "--repo", repo,
  "--android", androidDir,
  "--out", site,
], { stdio: "inherit" });
if (sync.status !== 0) process.exit(sync.status ?? 1);

const server = await startServer();
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;
const external = [];
let browser;
try {
  browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 412, height: 915 },
    serviceWorkers: "block",
  });
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
      return route.continue();
    }
    external.push(route.request().url());
    return route.abort("internetdisconnected");
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  await page.goto(base + "/", { waitUntil: "domcontentloaded" });
  await page.getByTestId("portal-home").waitFor();
  await page.getByTestId("heading").waitFor();
  await page.getByTestId("menu-btn").click();
  await page.getByTestId("murmur-drawer").waitFor();
  await page.getByTestId("menu-btn").click();
  await page.getByTestId("murmur-drawer").waitFor({ state: "hidden" });

  await page.evaluate(() => localStorage.setItem("playadda-zip-v1", JSON.stringify({ probe: 1, easy: 12 })));
  await page.goto(base + "/zip/", { waitUntil: "domcontentloaded" });
  await page.getByTestId("start-screen").waitFor();
  const stored = await page.evaluate(() => localStorage.getItem("playadda-zip-v1"));
  if (!stored || !stored.includes('"probe":1')) {
    throw new Error("localStorage did not survive reload on the packaged origin");
  }

  await page.goto(base + "/", { waitUntil: "domcontentloaded" });
  for (const [card, ready] of GAMES) {
    await page.getByTestId(card).click();
    const frame = page.frameLocator("#play iframe");
    await frame.getByTestId(ready).waitFor({ timeout: 15000 });
    await page.getByTestId("back").click();
    await page.getByTestId("portal-home").waitFor();
  }

  const zipFrameScore = await page.evaluate(async () => {
    const frame = document.createElement("iframe");
    frame.src = "/zip/";
    document.body.appendChild(frame);
    await new Promise((resolve) => { frame.onload = resolve; });
    return frame.contentWindow.localStorage.getItem("playadda-zip-v1");
  });
  if (!zipFrameScore || !zipFrameScore.includes('"probe":1')) {
    throw new Error("game iframe could not read the existing localStorage score");
  }

  if (pageErrors.length) {
    throw new Error("page errors:\n" + pageErrors.join("\n"));
  }
  if (external.length) {
    throw new Error("offline pages requested the network:\n" + external.join("\n"));
  }
  console.log("offline smoke passed: home, 7 games, localStorage, no external requests");
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
