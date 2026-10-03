const DEFAULTS = {
  count: 180,
  speed: 140,
  separation: 1.35,
  alignment: 1,
  cohesion: 0.85,
  avoid: 2.4,
  trail: 0.18,
  mode: "cursors",
};
const KEY = "murmur.params";
const MODES = ["cursors", "koya", "diwali"];
const CAP = { cursors: 400, koya: 20, diwali: 20 };
const STILL_S = 2;

function loadParams() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}
function saveParams(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* ignore */ }
}
function rand(a, b) { return a + Math.random() * (b - a); }
function wrapDelta(d, size) {
  if (d > size * 0.5) return d - size;
  if (d < -size * 0.5) return d + size;
  return d;
}
function isUiTarget(target) {
  return target instanceof Element && Boolean(target.closest("button, input, a, label, select, textarea, [data-ui]"));
}
function clampCount(mode, count) {
  return Math.max(mode === "cursors" ? 20 : 4, Math.min(CAP[mode], Math.round(count)));
}

function createSim(opts) {
  const sim = {
    w: opts.width, h: opts.height,
    mode: MODES.includes(opts.mode) ? opts.mode : "cursors",
    speed: opts.speed, separation: opts.separation, alignment: opts.alignment,
    cohesion: opts.cohesion, avoid: opts.avoid,
    requestedCount: opts.count, agents: [], sparks: [], bursts: [],
    pointer: { x: 0, y: 0, on: false, lastMove: -STILL_S, panic: 0 },
    time: 0,
  };
  function spawnCursor() {
    const a = rand(0, Math.PI * 2);
    const s = sim.speed * rand(0.7, 1.1);
    return { kind: "cursor", x: rand(0, sim.w), y: rand(0, sim.h), vx: Math.cos(a) * s, vy: Math.sin(a) * s };
  }
  function spawnFish() {
    const ang = rand(0, Math.PI * 2);
    return { kind: "koya", x: rand(48, Math.max(49, sim.w - 48)), y: rand(48, Math.max(49, sim.h - 48)), vx: Math.cos(ang) * 36, vy: Math.sin(ang) * 36, hue: rand(168, 198) };
  }
  function spawnRocket() {
    return { kind: "rocket", x: rand(40, Math.max(41, sim.w - 40)), y: sim.h - rand(28, 90), vx: rand(-26, 26), vy: -rand(100, 168), hue: rand(8, 46) };
  }
  function burst(x, y, hue, reason) {
    sim.bursts.push({ x, y, hue, reason, t: sim.time });
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2;
      const sp = rand(50, 170);
      sim.sparks.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, hue: (hue + rand(-24, 48) + 360) % 360, life: rand(0.4, 0.85) });
    }
  }
  function fill() {
    const n = clampCount(sim.mode, sim.requestedCount);
    sim.agents = [];
    for (let i = 0; i < n; i++) sim.agents.push(sim.mode === "koya" ? spawnFish() : sim.mode === "diwali" ? spawnRocket() : spawnCursor());
  }
  sim.still = () => sim.time - sim.pointer.lastMove >= STILL_S;
  sim.setMode = (mode) => {
    if (!MODES.includes(mode) || mode === sim.mode) return sim.mode;
    sim.mode = mode;
    sim.sparks = [];
    fill();
    return sim.mode;
  };
  sim.setCount = (n) => {
    sim.requestedCount = n;
    const target = clampCount(sim.mode, n);
    const spawn = sim.mode === "koya" ? spawnFish : sim.mode === "diwali" ? spawnRocket : spawnCursor;
    while (sim.agents.length < target) sim.agents.push(spawn());
    if (sim.agents.length > target) sim.agents.length = target;
  };
  sim.resize = (w, h) => { sim.w = w; sim.h = h; };
  sim.setPointer = (x, y, time = sim.time, moving = true) => {
    const moved = moving && Math.hypot(x - sim.pointer.x, y - sim.pointer.y) > 0.5;
    sim.pointer.x = x; sim.pointer.y = y; sim.pointer.on = true;
    sim.time = Math.max(sim.time, time);
    if (moved) sim.pointer.lastMove = sim.time;
  };
  sim.explode = (agent, reason) => {
    const i = sim.agents.indexOf(agent);
    if (i < 0) return;
    burst(agent.x, agent.y, agent.hue ?? 28, reason);
    sim.agents.splice(i, 1);
    if (sim.mode === "diwali" && sim.agents.length < clampCount(sim.mode, sim.requestedCount)) sim.agents.push(spawnRocket());
  };
  sim.blastAt = (x, y) => {
    for (const a of [...sim.agents]) if (a.kind === "rocket" && Math.hypot(a.x - x, a.y - y) < 42) sim.explode(a, "pointer");
  };
  sim.pointerDown = (x, y, time = sim.time) => {
    sim.setPointer(x, y, time, true);
    sim.pointer.panic = 0.35;
    if (sim.mode === "diwali") sim.blastAt(x, y);
  };
  sim.scatter = () => {
    sim.pointer.panic = 0.7;
    if (sim.mode === "diwali") {
      for (const a of [...sim.agents]) sim.explode(a, "pointer");
      return;
    }
    const cx = sim.pointer.on ? sim.pointer.x : sim.w / 2;
    const cy = sim.pointer.on ? sim.pointer.y : sim.h / 2;
    for (const a of sim.agents) {
      const dx = wrapDelta(a.x - cx, sim.w);
      const dy = wrapDelta(a.y - cy, sim.h);
      const m = Math.hypot(dx, dy) || 1;
      a.vx += (dx / m) * 280;
      a.vy += (dy / m) * 280;
    }
  };
  function tickCursors(dt) {
    const maxSpeed = sim.speed;
    const minSpeed = maxSpeed * 0.35;
    for (const b of sim.agents) {
      let sx = 0, sy = 0, ax = 0, ay = 0, cx = 0, cy = 0, n = 0, ns = 0;
      for (const o of sim.agents) {
        if (o === b) continue;
        const dx = wrapDelta(o.x - b.x, sim.w);
        const dy = wrapDelta(o.y - b.y, sim.h);
        const d2 = dx * dx + dy * dy;
        if (d2 > 56 * 56 || d2 === 0) continue;
        const d = Math.sqrt(d2);
        if (b.vx * dx + b.vy * dy < -0.15 * Math.hypot(b.vx, b.vy) * d) continue;
        n++; ax += o.vx; ay += o.vy; cx += dx; cy += dy;
        if (d < 22) { const f = (22 - d) / 22; sx -= (dx / d) * f; sy -= (dy / d) * f; ns++; }
      }
      let fx = 0, fy = 0;
      if (ns) { fx += (sx / ns) * sim.separation * 220; fy += (sy / ns) * sim.separation * 220; }
      if (n) {
        ax /= n; ay /= n; const am = Math.hypot(ax, ay) || 1;
        fx += ((ax / am) * maxSpeed - b.vx) * sim.alignment * 2.2;
        fy += ((ay / am) * maxSpeed - b.vy) * sim.alignment * 2.2;
        cx /= n; cy /= n; const cm = Math.hypot(cx, cy) || 1;
        fx += (cx / cm) * sim.cohesion * 40; fy += (cy / cm) * sim.cohesion * 40;
      }
      if (sim.pointer.on || sim.pointer.panic > 0) {
        const dx = wrapDelta(b.x - sim.pointer.x, sim.w);
        const dy = wrapDelta(b.y - sim.pointer.y, sim.h);
        const d = Math.hypot(dx, dy) || 1;
        const reach = 110 * (1 + sim.pointer.panic * 1.8);
        if (d < reach) {
          const f = ((reach - d) / reach) * sim.avoid * 320 * (1 + sim.pointer.panic * 2);
          fx += (dx / d) * f; fy += (dy / d) * f;
        }
      }
      b.vx += fx * dt; b.vy += fy * dt;
      let spd = Math.hypot(b.vx, b.vy);
      if (spd > maxSpeed) { b.vx = (b.vx / spd) * maxSpeed; b.vy = (b.vy / spd) * maxSpeed; }
      else if (spd < minSpeed && spd > 0) { b.vx = (b.vx / spd) * minSpeed; b.vy = (b.vy / spd) * minSpeed; }
      b.x = (b.x + b.vx * dt + sim.w) % sim.w;
      b.y = (b.y + b.vy * dt + sim.h) % sim.h;
    }
  }
  function tickKoya(dt) {
    const cozy = sim.pointer.on && !sim.still();
    for (const fish of sim.agents) {
      let fx = 0, fy = 0;
      const dx = sim.pointer.x - fish.x;
      const dy = sim.pointer.y - fish.y;
      const d = Math.hypot(dx, dy) || 1;
      if (cozy) { const pull = Math.min(240, 50 + d * 0.9); fx += (dx / d) * pull; fy += (dy / d) * pull; }
      else { fx -= (dx / d) * 170; fy -= (dy / d) * 170; }
      fish.vx += fx * dt; fish.vy += fy * dt;
      const spd = Math.hypot(fish.vx, fish.vy) || 1;
      const cap = cozy ? 160 : 100;
      if (spd > cap) { fish.vx = (fish.vx / spd) * cap; fish.vy = (fish.vy / spd) * cap; }
      fish.x = Math.max(8, Math.min(sim.w - 8, fish.x + fish.vx * dt));
      fish.y = Math.max(8, Math.min(sim.h - 8, fish.y + fish.vy * dt));
    }
  }
  function tickRockets(dt) {
    for (const rocket of [...sim.agents]) {
      rocket.vy -= 16 * dt;
      rocket.x += rocket.vx * dt;
      rocket.y += rocket.vy * dt;
      if (rocket.x <= 10 || rocket.x >= sim.w - 10 || rocket.y <= 10 || rocket.y >= sim.h - 10) sim.explode(rocket, "edge");
    }
  }
  sim.tick = (dt, time) => {
    const step = Math.min(0.05, dt);
    sim.time = time ?? sim.time + step;
    if (sim.mode === "koya") tickKoya(step);
    else if (sim.mode === "diwali") tickRockets(step);
    else tickCursors(step);
    sim.sparks = sim.sparks.filter((s) => { s.life -= step; s.x += s.vx * step; s.y += s.vy * step; s.vy += 36 * step; return s.life > 0; });
    if (sim.pointer.panic > 0) sim.pointer.panic = Math.max(0, sim.pointer.panic - step);
    if (sim.agents.length > CAP[sim.mode]) sim.agents.length = CAP[sim.mode];
  };
  fill();
  return sim;
}

function draw(ctx, sim, trail) {
  ctx.fillStyle = `rgba(7, 8, 12, ${1 - trail * 0.55})`;
  ctx.fillRect(0, 0, sim.w, sim.h);
  for (const a of sim.agents) {
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(Math.atan2(a.vy, a.vx));
    if (a.kind === "koya") {
      ctx.fillStyle = `hsl(${a.hue}, 62%, 62%)`;
      ctx.beginPath(); ctx.ellipse(0, 0, 9, 4.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(-13, 4); ctx.lineTo(-13, -4); ctx.fill();
    } else if (a.kind === "rocket") {
      ctx.fillStyle = `hsl(${a.hue}, 85%, 58%)`;
      ctx.fillRect(-6, -2, 12, 4);
      ctx.fillStyle = "rgba(255, 196, 92, .85)";
      ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(-12, 2.4); ctx.lineTo(-12, -2.4); ctx.fill();
    } else {
      ctx.fillStyle = "#9fd8d0";
      ctx.beginPath(); ctx.moveTo(7.5, 0); ctx.lineTo(-5.5, 3.4); ctx.lineTo(-3.2, 0); ctx.lineTo(-5.5, -3.4); ctx.fill();
    }
    ctx.restore();
  }
  for (const s of sim.sparks) {
    ctx.beginPath();
    ctx.fillStyle = `hsla(${s.hue}, 90%, 62%, ${Math.max(0, s.life)})`;
    ctx.arc(s.x, s.y, 2.4 + s.life * 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function ensureModes(sim, params) {
  const drawer = document.getElementById("murmur-drawer");
  if (!drawer || document.getElementById("mode-cursors")) return;
  const box = document.createElement("fieldset");
  box.className = "modes";
  box.setAttribute("data-ui", "");
  box.innerHTML = '<legend>Mode</legend>' +
    '<label><input id="mode-cursors" data-testid="mode-cursors" data-mode="cursors" data-ui type="checkbox"> Cursors</label>' +
    '<label><input id="mode-koya" data-testid="mode-koya" data-mode="koya" data-ui type="checkbox"> Koya fish</label>' +
    '<label><input id="mode-diwali" data-testid="mode-diwali" data-mode="diwali" data-ui type="checkbox"> Diwali rockets</label>' +
    '<p class="hint" id="mode-hint"></p>';
  drawer.insertBefore(box, drawer.querySelector(".panel-head")?.nextSibling || drawer.firstChild);
  if (!document.getElementById("murmur-mode-style")) {
    const style = document.createElement("style");
    style.id = "murmur-mode-style";
    style.textContent = ".modes{border:1px solid var(--line);border-radius:12px;padding:.45rem .7rem .55rem;margin:0 0 .8rem}.modes legend{padding:0 .3rem;color:var(--accent);font-size:.72rem;letter-spacing:.08em;text-transform:uppercase}.modes label{display:flex;align-items:center;gap:.45rem;min-height:36px;font-size:.8rem}.modes input{accent-color:var(--accent)}";
    document.head.appendChild(style);
  }
  function sync() {
    for (const mode of MODES) {
      const el = document.getElementById(`mode-${mode}`);
      if (el) el.checked = sim.mode === mode;
    }
    const hint = document.getElementById("mode-hint");
    if (hint) hint.textContent = sim.mode === "koya"
      ? "Koya cozy into a moving pointer, then disperse after 2s still. Max 20."
      : sim.mode === "diwali"
        ? "Rockets burst at an edge or on pointer contact. Max 20."
        : "Cursors avoid the pointer.";
  }
  box.querySelectorAll("[data-mode]").forEach((el) => {
    el.addEventListener("change", () => {
      if (!el.checked) { el.checked = true; return; }
      params.mode = sim.setMode(el.getAttribute("data-mode"));
      saveParams(params);
      sync();
    });
  });
  sync();
}

function bindSlider(sim, params, id, key) {
  const el = document.getElementById(id);
  const out = document.getElementById(`${id}-val`);
  if (!el || !out) return;
  el.value = params[key];
  out.textContent = key === "count" || key === "speed" ? String(Math.round(params[key])) : Number(params[key]).toFixed(2);
  el.addEventListener("input", () => {
    const v = Number(el.value);
    params[key] = v;
    sim[key] = v;
    out.textContent = key === "count" || key === "speed" ? String(Math.round(v)) : v.toFixed(2);
    if (key === "count") sim.setCount(v);
    saveParams(params);
  });
}

window.startMurmur = function startMurmur(canvas) {
  const params = loadParams();
  if (window.innerWidth < 600) params.count = Math.min(params.count, 110);
  const sim = createSim({
    width: window.innerWidth, height: window.innerHeight,
    mode: params.mode, count: params.count, speed: params.speed,
    separation: params.separation, alignment: params.alignment,
    cohesion: params.cohesion, avoid: params.avoid,
  });
  const ctx = canvas.getContext("2d");
  const api = { get paused() { return api._paused; }, set paused(v) { api._paused = v; }, sim };
  api._paused = false;
  let last = performance.now();
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    sim.resize(window.innerWidth, window.innerHeight);
    canvas.width = Math.floor(sim.w * dpr);
    canvas.height = Math.floor(sim.h * dpr);
    canvas.style.width = `${sim.w}px`;
    canvas.style.height = `${sim.h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  bindSlider(sim, params, "sep", "separation");
  bindSlider(sim, params, "ali", "alignment");
  bindSlider(sim, params, "coh", "cohesion");
  bindSlider(sim, params, "avo", "avoid");
  bindSlider(sim, params, "spd", "speed");
  bindSlider(sim, params, "pop", "count");
  ensureModes(sim, params);
  const pause = document.getElementById("pause");
  if (pause) pause.addEventListener("click", () => { api._paused = !api._paused; pause.textContent = api._paused ? "Resume" : "Pause"; });
  document.getElementById("reset")?.addEventListener("click", () => sim.setCount(params.count));
  document.getElementById("scatter")?.addEventListener("click", () => sim.scatter());
  window.addEventListener("resize", resize);
  window.addEventListener("pointermove", (e) => sim.setPointer(e.clientX, e.clientY, sim.time, true));
  window.addEventListener("pointerdown", (e) => { if (!isUiTarget(e.target)) sim.pointerDown(e.clientX, e.clientY, sim.time); });
  window.addEventListener("pointerleave", () => { sim.pointer.on = false; });
  window.addEventListener("keydown", (e) => {
    if (isUiTarget(e.target)) return;
    if (e.code === "Space") { e.preventDefault(); api._paused = !api._paused; if (pause) pause.textContent = api._paused ? "Resume" : "Pause"; }
    if (e.key === "r" || e.key === "R") sim.setCount(params.count);
    if (e.key === "s" || e.key === "S") sim.scatter();
  });
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!api._paused) sim.tick(dt);
    draw(ctx, sim, params.trail);
    requestAnimationFrame(frame);
  }
  resize();
  window.__murmur = sim;
  requestAnimationFrame(frame);
  return api;
};
