import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadFlock(storage) {
  const sandbox = {
    console,
    performance: { now: () => 0 },
    requestAnimationFrame() {},
    localStorage: storage,
    document: {
      getElementById() { return null; },
      createElement() { return { style: {} }; },
      head: { appendChild() {} },
      addEventListener() {},
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(join(ROOT, "js/flock.js"), "utf8"), sandbox, { filename: "js/flock.js" });
  return sandbox;
}

function memoryStorage(initial) {
  const data = new Map(Object.entries(initial ?? {}));
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); },
  };
}

test("count input accepts whole numbers and rejects anything else", () => {
  const { parseMurmurCount, MURMUR_COUNT } = loadFlock(memoryStorage());
  assert.equal(MURMUR_COUNT.defaultCount, 100);
  assert.equal(MURMUR_COUNT.min, 1);
  assert.equal(MURMUR_COUNT.max, 200);

  function accepted(raw, count, clamped) {
    const parsed = parseMurmurCount(raw);
    assert.equal(parsed.ok, true, raw);
    assert.equal(parsed.count, count, raw);
    assert.equal(parsed.clamped, clamped, raw);
  }
  accepted("100", 100, false);
  accepted(" 40 ", 40, false);
  accepted("007", 7, false);
  accepted("1", 1, false);
  accepted("200", 200, false);
  accepted("0", 1, true);
  accepted("5000", 200, true);
  accepted("99999", 200, true);

  for (const bad of ["", "  ", "12.5", "12a", "fish", "+10", "1e2", "1.0"]) {
    const parsed = parseMurmurCount(bad);
    assert.equal(parsed.ok, false, bad);
    assert.match(parsed.error, /whole number/);
  }
  for (const bad of ["-5", "-3", "-1"]) {
    const parsed = parseMurmurCount(bad);
    assert.equal(parsed.ok, false, bad);
    assert.equal(parsed.error, "Enter a number from 1 to 200");
  }
});

test("each mode defaults to 100 and a saved count is loaded next time", () => {
  const storage = memoryStorage();
  const first = loadFlock(storage);
  const fresh = first.loadMurmurParams();
  assert.equal(fresh.counts.cursors, 100);
  assert.equal(fresh.counts.koya, 100);
  assert.equal(fresh.counts.diwali, 100);
  assert.equal(fresh.count, 100);
  assert.equal(fresh.mode, "cursors");

  fresh.mode = "koya";
  fresh.counts.koya = 25;
  fresh.counts.cursors = 40;
  fresh.count = 25;
  first.saveMurmurParams(fresh);

  const again = loadFlock(storage).loadMurmurParams();
  assert.equal(again.mode, "koya");
  assert.equal(again.counts.koya, 25);
  assert.equal(again.counts.cursors, 40);
  assert.equal(again.counts.diwali, 100);
  assert.equal(again.count, 25);
});

test("a legacy flock slider value does not override the per-mode default of 100", () => {
  const storage = memoryStorage({
    "murmur.params": JSON.stringify({
      mode: "diwali",
      count: 180,
      counts: { cursors: 180, koya: 180, diwali: 180 },
    }),
  });
  const params = loadFlock(storage).loadMurmurParams();
  assert.equal(params.mode, "diwali");
  assert.equal(params.counts.cursors, 100);
  assert.equal(params.counts.koya, 100);
  assert.equal(params.counts.diwali, 100);
  assert.equal(params.count, 100);

  params.counts.koya = 30;
  params.mode = "koya";
  params.count = 30;
  loadFlock(storage);
  const saved = loadFlock(storage);
  saved.saveMurmurParams(params);
  const again = loadFlock(storage).loadMurmurParams();
  assert.equal(again.mode, "koya");
  assert.equal(again.counts.koya, 30);
  assert.equal(again.counts.cursors, 100);
  assert.equal(again.counts.diwali, 100);
  assert.equal(again.count, 30);
});

test("apply rebuilds the current mode with exactly that many objects", () => {
  const { createSim } = loadFlock(memoryStorage());
  const sim = createSim({
    width: 412,
    height: 915,
    mode: "cursors",
    count: 100,
    counts: { cursors: 100, koya: 100, diwali: 100 },
    speed: 140,
  });
  assert.equal(sim.agents.length, 100);
  assert.equal(sim.setCount(40, true), 40);
  assert.equal(sim.agents.length, 40);
  assert.ok(sim.agents.every((agent) => agent.kind === "cursor"));

  assert.equal(sim.setMode("koya"), "koya");
  assert.equal(sim.agents.length, 100);
  assert.ok(sim.agents.every((agent) => agent.kind === "koya"));
  assert.equal(sim.setCount(1, true), 1);
  assert.equal(sim.agents.length, 1);

  assert.equal(sim.setMode("diwali"), "diwali");
  assert.equal(sim.agents.length, 100);
  assert.equal(sim.setCount(5000, true), 200);
  assert.equal(sim.agents.length, 200);
  assert.ok(sim.agents.every((agent) => agent.kind === "rocket"));

  assert.equal(sim.setMode("cursors"), "cursors");
  assert.equal(sim.agents.length, 40);
  assert.equal(sim.setMode("koya"), "koya");
  assert.equal(sim.agents.length, 1);
});

test("diwali keeps every rocket alive and spread through the pond", () => {
  const { createSim } = loadFlock(memoryStorage());
  const sim = createSim({ width: 412, height: 915, mode: "diwali", count: 180, speed: 140 });
  assert.equal(sim.agents.length, 180);
  assert.ok(sim.agents.every((agent) => agent.kind === "rocket"));
  assertRocketField(sim, "spawn");

  for (let i = 0; i < 30 * 4; i++) sim.tick(1 / 30);
  const live = sim.agents.filter((agent) => agent.kind === "rocket");
  assert.equal(live.length, 180);
  assertRocketField(sim, "after flight");

  assert.equal(sim.setCount(100, true), 100);
  assert.equal(sim.agents.filter((agent) => agent.kind === "rocket").length, 100);
});

function assertRocketField(sim, label) {
  const rockets = sim.agents.filter((agent) => agent.kind === "rocket");
  assert.equal(rockets.length, sim.agents.length, label);
  let ySum = 0;
  let bottom = 0;
  for (const rocket of rockets) {
    assert.ok(rocket.x > 10 && rocket.x < sim.w - 10, `${label} x ${rocket.x}`);
    assert.ok(rocket.y > 10 && rocket.y < sim.h - 10, `${label} y ${rocket.y}`);
    ySum += rocket.y;
    if (rocket.y > sim.h * 0.8) bottom++;
  }
  const mean = ySum / rockets.length;
  const variance = rockets.reduce((sum, rocket) => sum + (rocket.y - mean) ** 2, 0) / rockets.length;
  assert.ok(Math.sqrt(variance) >= sim.h * 0.12, `${label} y spread ${Math.sqrt(variance).toFixed(1)}`);
  assert.ok(bottom / rockets.length < 0.45, `${label} ${bottom} rockets on the bottom`);
}
