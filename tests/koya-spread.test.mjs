import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadCreateSim() {
  const sandbox = {
    console,
    performance: { now: () => 0 },
    requestAnimationFrame() {},
    localStorage: {
      getItem() { return null; },
      setItem() {},
    },
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
  assert.equal(typeof sandbox.createSim, "function");
  return sandbox.createSim;
}

const createSim = loadCreateSim();

function meanNearest(agents) {
  let sum = 0;
  for (const a of agents) {
    let best = Infinity;
    for (const b of agents) {
      if (a === b) continue;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < best) best = d;
    }
    sum += best;
  }
  return sum / agents.length;
}

function axisStd(agents, key) {
  const mean = agents.reduce((sum, agent) => sum + agent[key], 0) / agents.length;
  const variance = agents.reduce((sum, agent) => sum + (agent[key] - mean) ** 2, 0) / agents.length;
  return Math.sqrt(variance);
}

function edgeFraction(agents, w, h, band = 14) {
  let near = 0;
  for (const agent of agents) {
    if (agent.x < band || agent.y < band || agent.x > w - band || agent.y > h - band) near++;
  }
  return near / agents.length;
}

function clump(sim, x, y) {
  for (const fish of sim.agents) {
    fish.x = x;
    fish.y = y;
    fish.vx = 0;
    fish.vy = 0;
  }
}

function run(sim, seconds) {
  const steps = Math.round(seconds * 30);
  for (let i = 0; i < steps; i++) sim.tick(1 / 30);
}

function averagedSpread(sim, seconds = 1.5) {
  const steps = Math.round(seconds * 30);
  const acc = { nn: 0, sx: 0, sy: 0, edge: 0, n: 0 };
  for (let i = 0; i < steps; i++) {
    sim.tick(1 / 30);
    if ((i + 1) % 10 !== 0) continue;
    acc.nn += meanNearest(sim.agents);
    acc.sx += axisStd(sim.agents, "x");
    acc.sy += axisStd(sim.agents, "y");
    acc.edge += edgeFraction(sim.agents, sim.w, sim.h);
    acc.n++;
  }
  return {
    nn: acc.nn / acc.n,
    sx: acc.sx / acc.n,
    sy: acc.sy / acc.n,
    edge: acc.edge / acc.n,
  };
}

function assertSpread(sim, sample, label) {
  const ideal = Math.sqrt((sim.w * sim.h) / sim.agents.length);
  assert.ok(
    sample.nn >= ideal * 0.38,
    `${label}: average nearest neighbour ${sample.nn.toFixed(1)}px, want >= ${(ideal * 0.38).toFixed(1)}px`,
  );
  assert.ok(sample.sx >= sim.w * 0.14, `${label}: x spread ${sample.sx.toFixed(1)}px`);
  assert.ok(sample.sy >= sim.h * 0.14, `${label}: y spread ${sample.sy.toFixed(1)}px`);
  assert.ok(sample.edge <= 0.2, `${label}: ${Math.round(sample.edge * 100)}% of fish on the glass`);
  assert.equal(sim.agents.length, 100);
}

test("Koya stay spread with no pointer and after pointer interaction", () => {
  const views = [
    [412, 915, "phone"],
    [1440, 900, "desktop"],
  ];

  for (const [w, h, name] of views) {
    const sim = createSim({ width: w, height: h, mode: "koya", count: 100 });
    clump(sim, w / 2, h / 2);
    run(sim, 8);
    assertSpread(sim, averagedSpread(sim), `${name} idle`);
    run(sim, 8);
    assertSpread(sim, averagedSpread(sim), `${name} still spread later`);

    const gx = w * 0.55;
    const gy = h * 0.48;
    for (let i = 0; i < 30 * 5; i++) {
      const t = sim.time + 1 / 30;
      sim.setPointer(gx + Math.sin(i / 8) * 28, gy + Math.cos(i / 11) * 20, t, true);
      sim.tick(1 / 30, t);
    }
    assert.ok(
      sim.meanDistanceToPointer() < Math.min(w, h) * 0.42,
      `${name}: fish should close on a moving pointer (${sim.meanDistanceToPointer().toFixed(1)}px)`,
    );

    sim.pointer.on = false;
    run(sim, 5);
    assertSpread(sim, averagedSpread(sim), `${name} after pointer leaves`);

    const resting = createSim({ width: w, height: h, mode: "koya", count: 100 });
    clump(resting, w * 0.28, h * 0.55);
    for (let i = 0; i < 50; i++) {
      const t = (i + 1) / 30;
      resting.setPointer(w * 0.72, h * (0.48 + 0.05 * Math.sin(i / 4)), t, true);
      resting.tick(1 / 30, t);
    }
    const holdAt = resting.time;
    for (let i = 0; i < 30 * 6; i++) resting.tick(1 / 30, holdAt + (i + 1) / 30);
    assert.ok(resting.still(), `${name}: resting pointer should count as still`);
    assertSpread(resting, averagedSpread(resting), `${name} after pointer rests`);
  }
});
