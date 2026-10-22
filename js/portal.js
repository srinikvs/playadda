(function () {
  const VERSION = "1.3.2";
  const canvas = document.getElementById("ambient");
  const flock = window.startMurmur(canvas);

  const menuBtn = document.getElementById("menu-btn");
  const drawer = document.getElementById("murmur-drawer");
  const scrim = document.getElementById("scrim");
  const play = document.getElementById("play");
  const frame = play.querySelector("iframe");
  const back = document.getElementById("back");
  const home = document.querySelector("[data-testid=portal-home]");

  const style = document.createElement("style");
  style.textContent = [
    "#login-overlay{position:fixed;inset:0;z-index:40;display:grid;place-items:center;padding:24px;pointer-events:none}",
    "#login-overlay[hidden]{display:none}",
    "#login-card{pointer-events:auto;width:min(420px,100%);background:color-mix(in srgb,#12141a 88%,transparent);border:1px solid #2a2e38;border-radius:24px;padding:28px 24px;box-shadow:0 18px 40px rgba(0,0,0,.35);backdrop-filter:blur(16px)}",
    "#login-card h2{font-family:Fraunces,Georgia,serif;font-weight:500;margin:0 0 8px}",
    "#login-card p{color:#8b9390;margin:0 0 16px}",
    "#login-card label{display:block;font-size:13px;margin:12px 0 6px;color:#e8eceb}",
    "#login-card input{width:100%;min-height:44px;border-radius:12px;border:1px solid #2a2e38;background:#07080c;color:#e8eceb;padding:0 12px;font:inherit}",
    "#login-submit{margin-top:16px;width:100%;min-height:44px;border:0;border-radius:999px;background:#9fd8d0;color:#07080c;font:inherit;font-weight:650}",
    "#login-error{min-height:1.2em;color:#ffb4b4;font-size:13px;margin:10px 0 0}",
    "#account-bar{display:flex;gap:12px;justify-content:center;align-items:center;flex-wrap:wrap;margin-top:14px;color:#9fd8d0;font-size:14px}",
    "#account-bar button{min-height:36px;border-radius:999px;border:1px solid #2a2e38;background:#1a1d24;color:#e8eceb;padding:0 12px}",
    "body.locked [data-testid=portal-home]{visibility:hidden}",
  ].join("");
  document.head.appendChild(style);

  const overlay = document.createElement("div");
  overlay.id = "login-overlay";
  overlay.dataset.testid = "login-overlay";
  overlay.dataset.ui = "";
  overlay.innerHTML = [
    '<form id="login-card" data-ui>',
    '<p class="kicker">Playadda</p>',
    "<h2>Sign in</h2>",
    "<p>Murmur keeps running. Enter your display name and the 6-digit authenticator code.</p>",
    '<label for="login-name">Display name</label>',
    '<input id="login-name" data-testid="login-name" data-ui name="name" autocomplete="username" required>',
    '<label for="login-code">Authenticator code</label>',
    '<input id="login-code" data-testid="login-code" data-ui name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required>',
    '<p id="login-error" data-testid="login-error" role="alert"></p>',
    '<button id="login-submit" data-testid="login-submit" data-ui type="submit">Submit</button>',
    '<p class="hint version" data-version>Playadda v__VERSION__</p>',
    "</form>",
  ].join("");
  document.body.appendChild(overlay);

  const bar = document.createElement("div");
  bar.id = "account-bar";
  bar.dataset.testid = "account-bar";
  bar.hidden = true;
  bar.innerHTML = '<span data-testid="account-name"></span><span data-testid="user-best"></span><span data-testid="overall-best"></span><button type="button" id="logout" data-testid="logout" data-ui>Log out</button>';
  document.querySelector("header")?.appendChild(bar);

  function lock(on) {
    document.body.classList.toggle("locked", on);
    overlay.hidden = !on;
    bar.hidden = on;
  }
  lock(true);

  async function refreshScores() {
    const res = await fetch("/api/scores", { credentials: "same-origin" });
    if (!res.ok) return;
    const data = await res.json();
    localStorage.setItem("playadda.scores." + data.name.toLowerCase(), JSON.stringify(data));
    bar.querySelector("[data-testid=account-name]").textContent = data.name;
    bar.querySelector("[data-testid=user-best]").textContent = "Your best " + (data.best || 0);
    const overall = data.overall || {};
    bar.querySelector("[data-testid=overall-best]").textContent = overall.score
      ? "Overall " + overall.score + " (" + overall.name + ")"
      : "Overall 0";
  }

  async function submitScore(game, score) {
    const res = await fetch("/api/scores", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ game, score }),
    });
    if (res.ok) await refreshScores();
  }
  window.playadda = { submitScore };
  window.addEventListener("message", (event) => {
    const data = event.data || {};
    if (data.type === "playadda:score") submitScore(data.game, data.score);
  });

  overlay.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const error = document.getElementById("login-error");
    error.textContent = "";
    const name = document.getElementById("login-name").value;
    const code = document.getElementById("login-code").value;
    const res = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, code }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      error.textContent = body.error || "Name or authenticator code is wrong";
      document.getElementById("login-code").value = "";
      return;
    }
    lock(false);
    await refreshScores();
  });

  document.getElementById("logout").addEventListener("click", async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    lock(true);
  });

  fetch("/api/auth/session", { credentials: "same-origin" }).then(async (res) => {
    if (!res.ok) return;
    lock(false);
    await refreshScores();
  }).catch(() => {});

  function setMenu(open) {
    drawer.hidden = !open;
    scrim.hidden = !open;
    drawer.classList.toggle("open", open);
    menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
    menuBtn.setAttribute("aria-label", open ? "Close Murmur controls" : "Open Murmur controls");
    menuBtn.innerHTML = open
      ? '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>'
      : '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/></svg>';
  }

  menuBtn.addEventListener("click", () => setMenu(drawer.hidden));
  scrim.addEventListener("click", () => setMenu(false));
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!play.hidden) closePlay();
      else setMenu(false);
    }
  });

  function closePlay() {
    play.classList.remove("open");
    play.hidden = true;
    frame.src = "about:blank";
    history.pushState({}, "", "/");
    if (flock) flock.paused = document.getElementById("pause")?.textContent === "Resume";
  }

  function openPlay(url) {
    setMenu(false);
    if (flock) flock.paused = true;
    frame.src = url;
    play.hidden = false;
    play.classList.add("open");
    history.pushState({ game: url }, "", url);
  }

  document.querySelectorAll("a.card").forEach((card) => {
    card.addEventListener("click", (e) => {
      e.preventDefault();
      if (document.body.classList.contains("locked")) return;
      openPlay(card.getAttribute("data-game"));
    });
  });
  back.addEventListener("click", (e) => {
    e.preventDefault();
    closePlay();
  });
  window.addEventListener("popstate", () => {
    if (location.pathname === "/" || location.pathname === "") closePlay();
  });

  document.querySelectorAll("[data-version]").forEach((el) => {
    el.textContent = el.textContent.replace("__VERSION__", VERSION);
  });
  if (home) home.setAttribute("data-auth", "required");
})();
