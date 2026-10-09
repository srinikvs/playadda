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

  for (const bad of ["", "  ", "12.5", "12a", "fish", "-3", "+10", "1e2", "1.0"]) {
    const parsed = parseMurmurCount(bad);
    assert.equal(parsed.ok, false, bad);
    assert.match(parsed.error, /whole number/);
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

test("a legacy single count is clamped and shared until each mode is set", () => {
  const storage = memoryStorage({
    "murmur.params": JSON.stringify({ mode: "diwali", count: 900 }),
  });
  const params = loadFlock(storage).loadMurmurParams();
  assert.equal(params.mode, "diwali");
  assert.equal(params.counts.cursors, 200);
  assert.equal(params.counts.koya, 200);
  assert.equal(params.counts.diwali, 200);
  assert.equal(params.count, 200);
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
