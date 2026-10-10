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
  assert.equal(fresh.counts.halloween, 100);
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

test("diwali rockets are in mixed phases at a sampled time", () => {
  const { createSim } = loadFlock(memoryStorage());
  const sim = createSim({ width: 412, height: 915, mode: "diwali", count: 180, speed: 140 });
  for (let i = 0; i < 30 * 3; i++) sim.tick(1 / 30);
  assert.equal(sim.agents.length, 180);
  const sampled = phaseCounts(sim);
  assertMixed(sampled, "sample");
  for (const phase of ["wait", "rise", "burst", "fade"]) {
    assert.ok(sampled[phase] > 0, `${phase} missing in ${JSON.stringify(sampled)}`);
  }
  assertRocketField(sim, "mixed");

  sim.scatter();
  for (let i = 0; i < 30 * 2; i++) sim.tick(1 / 30);
  assert.equal(sim.agents.length, 180);
  const relaunched = phaseCounts(sim);
  assertMixed(relaunched, "after burst");
  assert.ok(relaunched.wait > 0 && relaunched.rise > 0, JSON.stringify(relaunched));
});

function phaseCounts(sim) {
  const counts = { wait: 0, rise: 0, burst: 0, fade: 0 };
  for (const rocket of sim.agents) {
    if (rocket.kind !== "rocket") continue;
    counts[rocket.phase] = (counts[rocket.phase] || 0) + 1;
  }
  return counts;
}

function assertMixed(counts, label) {
  const active = Object.entries(counts).filter(([, n]) => n > 0).map(([name]) => name);
  assert.ok(active.length >= 2, `${label} phases ${active.join(",") || "none"} ${JSON.stringify(counts)}`);
}

function assertRocketField(sim, label) {
  const rockets = sim.agents.filter((agent) => agent.kind === "rocket");
  assert.equal(rockets.length, sim.agents.length, label);
  const placed = rockets.filter((rocket) => rocket.phase === "wait" || rocket.phase === "rise");
  assert.ok(placed.length >= rockets.length * 0.35, `${label} placed ${placed.length}`);
  let ySum = 0;
  let bottom = 0;
  for (const rocket of placed) {
    assert.ok(rocket.x > 10 && rocket.x < sim.w - 10, `${label} x ${rocket.x}`);
    assert.ok(rocket.y > 10 && rocket.y < sim.h - 10, `${label} y ${rocket.y}`);
    ySum += rocket.y;
    if (rocket.y > sim.h * 0.8) bottom++;
  }
  const mean = ySum / placed.length;
  const variance = placed.reduce((sum, rocket) => sum + (rocket.y - mean) ** 2, 0) / placed.length;
  assert.ok(Math.sqrt(variance) >= sim.h * 0.12, `${label} y spread ${Math.sqrt(variance).toFixed(1)}`);
  assert.ok(bottom / placed.length < 0.45, `${label} ${bottom} rockets on the bottom`);
}

test("halloween keeps its own count and splits lanterns and bats", () => {
  const storage = memoryStorage({
    "murmur.params": JSON.stringify({
      countsVersion: 2,
      mode: "koya",
      counts: { cursors: 12, koya: 30, diwali: 80 },
    }),
  });
  const loaded = loadFlock(storage);
  const params = loaded.loadMurmurParams();
  assert.equal(params.counts.cursors, 12);
  assert.equal(params.counts.koya, 30);
  assert.equal(params.counts.diwali, 80);
  assert.equal(params.counts.halloween, 100);

  params.mode = "halloween";
  params.counts.halloween = 40;
  params.count = 40;
  loaded.saveMurmurParams(params);
  const again = loadFlock(storage).loadMurmurParams();
  assert.equal(again.mode, "halloween");
  assert.equal(again.counts.halloween, 40);
  assert.equal(again.counts.cursors, 12);
  assert.equal(again.counts.koya, 30);
  assert.equal(again.counts.diwali, 80);
  assert.equal(again.count, 40);

  const { createSim } = loadFlock(memoryStorage());
  const sim = createSim({ width: 412, height: 915, mode: "halloween", count: 100, speed: 140 });
  assertSplit(sim, 100);
  const kept = sim.agents.find((agent) => agent.kind === "lantern");
  assert.equal(sim.setCount(120), 120);
  assertSplit(sim, 120);
  assert.ok(sim.agents.some((agent) => agent === kept));
  assert.equal(sim.setCount(200, true), 200);
  assertSplit(sim, 200);
  assert.equal(sim.setCount(7, true), 7);
  assertSplit(sim, 7);
  assert.equal(sim.setCount(1, true), 1);
  assertSplit(sim, 1);

  assert.equal(sim.setMode("cursors"), "cursors");
  assert.equal(sim.agents.length, 100);
  assert.ok(sim.agents.every((agent) => agent.kind === "cursor"));
});

test("halloween lanterns flicker independently and bats move on their own paths", () => {
  const { createSim } = loadFlock(memoryStorage());
  const sim = createSim({ width: 412, height: 915, mode: "halloween", count: 100, speed: 140 });
  const lanterns = sim.agents.filter((agent) => agent.kind === "lantern");
  const bats = sim.agents.filter((agent) => agent.kind === "bat");
  assert.equal(lanterns.length, 50);
  assert.equal(bats.length, 50);
  assert.ok(lanterns.some((lantern) => lantern.on));
  assert.ok(lanterns.some((lantern) => !lantern.on));

  const nextTimes = lanterns.map((lantern) => lantern.next);
  const onFor = lanterns.map((lantern) => lantern.onFor);
  assert.ok(Math.max(...nextTimes) - Math.min(...nextTimes) > 0.2);
  assert.ok(Math.max(...onFor) - Math.min(...onFor) > 0.2);
  const xs = lanterns.map((lantern) => lantern.x);
  const ys = lanterns.map((lantern) => lantern.y);
  assert.ok(Math.max(...xs) - Math.min(...xs) > sim.w * 0.55);
  assert.ok(Math.max(...ys) - Math.min(...ys) > sim.h * 0.55);
  const planted = lanterns.map((lantern) => [lantern.x, lantern.y]);

  const before = lanterns.map((lantern) => lantern.on);
  let mixed = false;
  for (let i = 0; i < 90 && !mixed; i++) {
    sim.tick(1 / 30);
    let changed = 0;
    for (let j = 0; j < lanterns.length; j++) if (lanterns[j].on !== before[j]) changed++;
    if (changed > 0 && changed < lanterns.length) mixed = true;
  }
  assert.ok(mixed, "lanterns toggled together");
  lanterns.forEach((lantern, i) => {
    assert.equal(lantern.x, planted[i][0]);
    assert.equal(lantern.y, planted[i][1]);
  });

  const speeds = bats.map((bat) => bat.speed);
  assert.ok(Math.max(...speeds) - Math.min(...speeds) > 20);
  const start = bats.map((bat) => [bat.x, bat.y]);
  for (let i = 0; i < 45; i++) sim.tick(1 / 30);
  let moved = 0;
  for (let i = 0; i < bats.length; i++) {
    const dist = Math.hypot(bats[i].x - start[i][0], bats[i].y - start[i][1]);
    if (dist > 12) moved++;
    assert.ok(bats[i].x >= 10 && bats[i].x <= sim.w - 10, `bat x ${bats[i].x}`);
    assert.ok(bats[i].y >= 10 && bats[i].y <= sim.h - 10, `bat y ${bats[i].y}`);
  }
  assert.ok(moved >= bats.length * 0.8, `${moved} bats moved`);
  lanterns.forEach((lantern, i) => {
    assert.equal(lantern.x, planted[i][0]);
    assert.equal(lantern.y, planted[i][1]);
  });
});

function assertSplit(sim, count) {
  const lanterns = Math.floor(count / 2);
  const bats = count - lanterns;
  const gotLanterns = sim.agents.filter((agent) => agent.kind === "lantern").length;
  const gotBats = sim.agents.filter((agent) => agent.kind === "bat").length;
  assert.equal(sim.agents.length, count);
  assert.equal(gotLanterns, lanterns);
  assert.equal(gotBats, bats);
}
